import assert from 'node:assert/strict';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { get as httpGet } from 'node:http';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { eq, inArray } from 'drizzle-orm';
import { db, atomic } from '../src/lib/server/db/index.ts';
import {
  user,
  session,
  account,
  galleries,
  photos,
  reservations,
} from '../src/lib/server/db/schema.ts';
import { remove, head, read, put, s3, bucket } from '../src/lib/server/storage/index.ts';
import { cleanup } from '../src/lib/server/photos/index.ts';
const origin = process.env.SMOKE_ORIGIN || process.env.ORIGIN || 'http://localhost:5173';
const password = randomUUID() + 'Aa1!';
const owners: string[] = [];
const hash = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');
async function req(
  path: string,
  cookie = '',
  body?: Record<string, unknown> | URLSearchParams,
  method?: string,
) {
  return fetch(new URL(path, origin), {
    method: method || (body ? 'POST' : 'GET'),
    redirect: 'manual',
    headers: {
      Accept: 'text/html',
      Origin: origin,
      Cookie: cookie,
      ...(body
        ? {
            'Content-Type':
              body instanceof URLSearchParams
                ? 'application/x-www-form-urlencoded'
                : 'application/json',
          }
        : {}),
    },
    body: body
      ? body instanceof URLSearchParams
        ? body.toString()
        : JSON.stringify(body)
      : undefined,
  });
}
async function checkArchive(path: string, cookie: string, expected: { data: Buffer }[]) {
  const response = await req(path, cookie);
  assert.equal(response.status, 200, 'Архив доступен');
  assert.match(response.headers.get('content-type')!, /application\/zip/);
  assert.match(response.headers.get('cache-control')!, /no-store/);
  const zip = Buffer.from(await response.arrayBuffer());
  if (process.env.SMOKE_ARCHIVE_PATH) writeFileSync(process.env.SMOKE_ARCHIVE_PATH, zip);
  const end64 = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x06, 0x06]));
  assert.ok(end64 >= 0, 'ZIP64 каталог присутствует');
  const count = Number(zip.readBigUInt64LE(end64 + 32));
  let offset = Number(zip.readBigUInt64LE(end64 + 48));
  assert.equal(count, expected.length);
  const hashes: string[] = [];
  const names: string[] = [];
  for (let i = 0; i < count; i++) {
    assert.equal(zip.readUInt32LE(offset), 0x02014b50);
    assert.equal(zip.readUInt16LE(offset + 10), 0, 'Оригинал без перекодирования');
    const size = zip.readUInt32LE(offset + 24);
    const nameLength = zip.readUInt16LE(offset + 28);
    const extraLength = zip.readUInt16LE(offset + 30);
    const commentLength = zip.readUInt16LE(offset + 32);
    const local = zip.readUInt32LE(offset + 42);
    names.push(zip.subarray(offset + 46, offset + 46 + nameLength).toString());
    assert.equal(zip.readUInt32LE(local), 0x04034b50);
    const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    hashes.push(hash(zip.subarray(start, start + size)));
    offset += 46 + nameLength + extraLength + commentLength;
  }
  assert.deepEqual(
    hashes.sort(),
    expected.map((item) => hash(item.data)).sort(),
    'Байты оригиналов в ZIP',
  );
  assert.equal(new Set(names).size, expected.length);
  assert.ok(names.every((name) => !name.includes('/') && !name.includes('\\')));
}
async function register() {
  const response = await req('/api/auth/sign-up/email', '', {
    email: `smoke-${randomUUID()}@example.test`,
    name: 'Проверка',
    password,
    inviteCode: process.env.REGISTRATION_INVITE_CODE,
  });
  assert.equal(response.status, 200, 'Регистрация');
  const result = await response.json();
  owners.push(result.user.id);
  const cookie = response.headers
    .getSetCookie()
    .map((v) => v.split(';')[0])
    .join('; ');
  assert.ok(cookie, 'Cookie сессии');
  return { cookie, email: result.user.email };
}
async function create(cookie: string, title: string) {
  const response = await req('/dashboard', cookie, new URLSearchParams({ title }));
  assert.equal(response.status, 303, 'Создание галереи');
  return response.headers.get('location')!.split('/').pop()!;
}
async function action(id: string, cookie: string, action: string, fields = {}) {
  return req(`/dashboard/galleries/${id}?/${action}`, cookie, new URLSearchParams(fields));
}
async function reserve(id: string, cookie: string, data: Uint8Array, name: string, type: string) {
  const response = await req('/api/uploads/presign', cookie, {
    galleryId: id,
    files: [{ name, size: data.length, type }],
  });
  assert.equal(response.status, 200, 'Presign');
  return (await response.json()).uploads[0] as {
    id: string;
    url: string;
    requiredHeaders: Record<string, string>;
  };
}
async function upload(id: string, cookie: string, data: Uint8Array, name: string, type: string) {
  const signed = await reserve(id, cookie, data, name, type);
  const preflight = await fetch(signed.url, {
    method: 'OPTIONS',
    headers: {
      Origin: origin,
      'Access-Control-Request-Method': 'PUT',
      'Access-Control-Request-Headers': 'content-type',
    },
  });
  assert.ok(preflight.ok);
  assert.equal(preflight.headers.get('access-control-allow-origin'), origin, 'CORS origin');
  for (const size of [data.length - 1, data.length + 1]) {
    const rejected = await fetch(signed.url, {
      method: 'PUT',
      headers: signed.requiredHeaders,
      body: Buffer.alloc(size),
    });
    assert.equal(rejected.status, 403, 'S3 отклоняет изменение подписанного размера');
    await rejected.arrayBuffer();
  }
  const uploadKey = db().select().from(photos).where(eq(photos.id, signed.id)).get()!.uploadKey;
  await assert.rejects(
    () => head(uploadKey),
    (error: unknown) =>
      !!error &&
      typeof error === 'object' &&
      '$metadata' in error &&
      (error.$metadata as { httpStatusCode?: number }).httpStatusCode === 404,
    'Отказ PUT не создаёт объект',
  );
  const put = await fetch(signed.url, {
    method: 'PUT',
    headers: signed.requiredHeaders,
    body: Buffer.from(data),
  });
  assert.ok(put.ok, 'S3 PUT');
  const anonymous = await fetch(signed.url.split('?')[0]);
  assert.equal(anonymous.status, 403, 'Объект приватный');
  const confirms = await Promise.all([
    req('/api/uploads/confirm', cookie, { photoId: signed.id }),
    req('/api/uploads/confirm', cookie, { photoId: signed.id }),
  ]);
  assert.ok(
    confirms.some((r) => r.status === 200),
    'Первый confirm',
  );
  assert.ok(
    confirms.every((r) => [200, 409].includes(r.status)),
    'Конкурентный confirm',
  );
  assert.equal(
    (await req('/api/uploads/confirm', cookie, { photoId: signed.id })).status,
    200,
    'Повторный confirm',
  );
  // Replay old PUT: accepted original must remain unchanged.
  assert.ok(
    (
      await fetch(signed.url, {
        method: 'PUT',
        headers: signed.requiredHeaders,
        body: Buffer.alloc(data.length, 42),
      })
    ).ok,
  );
  return signed.id;
}
try {
  const loginPage = await req('/login');
  assert.equal(
    loginPage.headers.get('referrer-policy'),
    'same-origin',
    'Политика не ломает Origin обычных HTML-форм',
  );
  assert.equal((await req('/dashboard')).status, 303);
  assert.equal((await req('/api/uploads/presign', '', { galleryId: 'x', files: [] })).status, 401);
  const a = await register(),
    b = await register();
  assert.equal(
    (await req('/api/auth/sign-in/email', '', { email: a.email, password: 'wrong-password' }))
      .status,
    401,
  );
  const id = await create(a.cookie, 'Checkpoint <история>');
  assert.equal((await req(`/dashboard/galleries/${id}`, b.cookie)).status, 404, 'Чужая галерея');
  assert.equal((await action(id, b.cookie, 'save', { title: 'Чужая' })).status, 404);
  assert.equal((await action(id, a.cookie, 'publish')).status, 409, 'Пустая галерея');
  assert.equal((await action(id, a.cookie, 'save', { title: '', theme: 'light' })).status, 400);
  assert.equal(
    (
      await action(id, a.cookie, 'save', {
        title: 'Checkpoint <история>',
        description: 'Без регистрации',
        theme: 'dark',
      })
    ).status,
    200,
  );
  const input = sharp({ create: { width: 96, height: 64, channels: 4, background: '#c17b49' } });
  const originals: { id: string; data: Buffer }[] = [];
  for (const format of ['jpeg', 'png', 'webp'] as const) {
    const data = await input.clone().toFormat(format).toBuffer();
    const photoId = await upload(
      id,
      a.cookie,
      data,
      `портрет ${format}.${format}`,
      `image/${format}`,
    );
    originals.push({ id: photoId, data });
    const photo = db().select().from(photos).where(eq(photos.id, photoId)).get()!;
    const preview = await read(photo.previewKey!, photo.previewSize!);
    const metadata = await sharp(preview).metadata();
    assert.equal(metadata.format, 'webp');
    assert.equal(metadata.exif, undefined);
    assert.ok(photo.thumbnailKey);
    const thumbnailSize = (await head(photo.thumbnailKey!)).ContentLength!;
    const thumbnail = await read(photo.thumbnailKey!, thumbnailSize);
    const thumbnailMeta = await sharp(thumbnail).metadata();
    assert.equal(thumbnailMeta.format, 'webp');
    assert.ok(Math.max(thumbnailMeta.width!, thumbnailMeta.height!) <= 480);
  }
  const dashboardCover = await req(`/dashboard/galleries/${id}/cover`, a.cookie);
  assert.equal(dashboardCover.status, 302);
  assert.match(dashboardCover.headers.get('location')!, /thumbnails/);
  assert.equal((await req(`/dashboard/galleries/${id}/cover`, b.cookie)).status, 404);
  const sortedDashboard = await req('/dashboard?sort=size', a.cookie);
  assert.equal(sortedDashboard.status, 200);
  assert.match(await sortedDashboard.text(), new RegExp(`/dashboard/galleries/${id}/cover`));
  const ownerDownload = (galleryId: string, photoId: string) =>
    `/api/galleries/${galleryId}/photos/${photoId}/download`;
  for (const original of originals) {
    const response = await req(ownerDownload(id, original.id), a.cookie);
    assert.equal(response.status, 302, 'Владелец скачивает оригинал черновика');
    assert.match(response.headers.get('cache-control')!, /no-store/);
    const downloaded = await fetch(response.headers.get('location')!);
    assert.ok(downloaded.ok);
    assert.equal(hash(new Uint8Array(await downloaded.arrayBuffer())), hash(original.data));
    assert.match(downloaded.headers.get('content-disposition')!, /filename\*=UTF-8/i);
  }
  assert.equal((await req(ownerDownload(id, originals[0].id), b.cookie)).status, 404);
  assert.equal((await req(ownerDownload(id, originals[0].id))).status, 303);
  assert.equal((await req(ownerDownload(id, randomUUID()), a.cookie)).status, 404);
  const ownerArchive = `/api/galleries/${id}/archive`;
  await checkArchive(ownerArchive, a.cookie, originals);
  assert.equal((await req(ownerArchive, b.cookie)).status, 404);
  assert.equal((await req(ownerArchive)).status, 303);
  // Two independent HTTP requests compete for the last 100 bytes in real SQLite.
  const quotaGallery = await create(b.cookie, 'Гонка квоты');
  const held = await reserve(quotaGallery, b.cookie, Buffer.alloc(1), 'hold.png', 'image/png');
  const quota = Number(process.env.USER_STORAGE_QUOTA_BYTES || 5368709120);
  db()
    .$client.prepare('update upload_reservations set size=? where photo_id=?')
    .run(quota - 100, held.id);
  const competing = await Promise.all(
    [1, 2].map(() =>
      req('/api/uploads/presign', b.cookie, {
        galleryId: quotaGallery,
        files: [{ name: 'race.png', size: 60, type: 'image/png' }],
      }),
    ),
  );
  assert.deepEqual(
    competing.map((r) => r.status).sort(),
    [200, 409],
    'Два запроса не делят одну квоту',
  );
  db()
    .$client.prepare('update upload_reservations set expires_at=? where user_id=?')
    .run(Date.now() - 1, owners[1]);
  await cleanup(100);
  assert.equal(
    (
      await req('/api/uploads/presign', b.cookie, {
        galleryId: id,
        files: [{ name: 'foreign.png', size: 1, type: 'image/png' }],
      })
    ).status,
    404,
  );
  const crossOrigin = await fetch(new URL('/api/uploads/presign', origin), {
    method: 'POST',
    headers: {
      Origin: 'https://invalid.example',
      Cookie: a.cookie,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
  assert.equal(crossOrigin.status, 403, 'CSRF JSON');
  // Simulate a process restart between preview PUT and SQLite commit.
  const abandoned = await reserve(id, a.cookie, Buffer.alloc(7), 'abandoned.png', 'image/png');
  const row = db().select().from(photos).where(eq(photos.id, abandoned.id)).get()!;
  await put(row.uploadKey, Buffer.from('partial'), 'image/png');
  await put(row.originalKey, Buffer.from('partial'), 'image/png');
  await put(
    row.originalKey.replace('/originals/', '/previews/') + '.webp',
    Buffer.from('partial'),
    'image/webp',
  );
  db().$client.prepare("update photos set status='processing' where id=?").run(abandoned.id);
  db()
    .$client.prepare('update upload_reservations set expires_at=? where photo_id=?')
    .run(Date.now() - 1, abandoned.id);
  s3().middlewareStack.add(
    () => async () => {
      throw new Error('Injected DELETE failure');
    },
    { name: 'smokeDeleteFailure', step: 'initialize' },
  );
  try {
    assert.equal(await cleanup(100), 0, 'DELETE failure сохраняет возможность повтора');
  } finally {
    s3().middlewareStack.remove('smokeDeleteFailure');
  }
  assert.equal(
    db().select().from(reservations).where(eq(reservations.photoId, abandoned.id)).get()!.cleanedAt,
    null,
  );
  assert.equal(await cleanup(100), 1);
  await assert.rejects(() => head(row.originalKey));
  assert.equal(
    (await req('/api/uploads/confirm', a.cookie, { photoId: abandoned.id })).status,
    410,
  );
  const malformed = Buffer.from('not an image');
  const bad = await reserve(id, a.cookie, malformed, 'bad.png', 'image/png');
  await fetch(bad.url, { method: 'PUT', headers: bad.requiredHeaders, body: malformed });
  assert.equal((await req('/api/uploads/confirm', a.cookie, { photoId: bad.id })).status, 422);
  const pending = await reserve(id, a.cookie, Buffer.alloc(1), 'pending.png', 'image/png');
  assert.equal((await req(ownerDownload(id, pending.id), a.cookie)).status, 404);
  assert.equal(
    (await action(id, a.cookie, 'publish')).status,
    409,
    'Незавершённый резерв блокирует публикацию',
  );
  await req('/api/uploads/cancel', a.cookie, { photoId: pending.id });
  db()
    .$client.prepare('update upload_reservations set expires_at=? where photo_id=?')
    .run(Date.now() - 1, bad.id);
  assert.ok((await cleanup(100)) >= 1);
  assert.equal(await cleanup(100), 0, 'Идемпотентная очистка');
  assert.equal((await action(id, a.cookie, 'cover', { photoId: originals[1].id })).status, 200);
  assert.equal(
    (await action(id, a.cookie, 'move', { photoId: originals[1].id, direction: 'up' })).status,
    200,
  );
  const racingData = await input.clone().png().toBuffer();
  const racing = await reserve(id, a.cookie, racingData, 'гонка.png', 'image/png');
  assert.ok(
    (await fetch(racing.url, { method: 'PUT', headers: racing.requiredHeaders, body: racingData }))
      .ok,
  );
  const [confirmed, published] = await Promise.all([
    req('/api/uploads/confirm', a.cookie, { photoId: racing.id }),
    action(id, a.cookie, 'publish'),
  ]);
  assert.equal(confirmed.status, 200);
  assert.ok([200, 409].includes(published.status));
  assert.equal(db().select().from(photos).where(eq(photos.id, racing.id)).get()!.status, 'ready');
  if (published.status === 409) assert.equal((await action(id, a.cookie, 'publish')).status, 200);
  originals.push({ id: racing.id, data: racingData });
  const gallery = db().select().from(galleries).where(eq(galleries.id, id)).get()!;
  const token = gallery.token!;
  const expiring = db().select().from(photos).where(eq(photos.id, originals[0].id)).get()!;
  const expiredUrl = await getSignedUrl(
    s3(),
    new GetObjectCommand({ Bucket: bucket(), Key: expiring.originalKey }),
    {
      expiresIn: 1,
      signingDate: new Date(Date.now() - 120000),
    },
  );
  assert.equal((await fetch(expiredUrl)).status, 403, 'Просроченная подпись S3 отклонена');
  const [racingArchive, racingUnpublish] = await Promise.all([
    req(`/api/downloads/${token}/archive`),
    action(id, a.cookie, 'unpublish'),
  ]);
  assert.equal(racingUnpublish.status, 200);
  assert.ok([200, 404].includes(racingArchive.status));
  if (racingArchive.status === 200) {
    const zip = Buffer.from(await racingArchive.arrayBuffer());
    assert.ok(zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x06, 0x06])) > 0);
  }
  assert.equal((await req(`/api/downloads/${token}/archive`)).status, 404);
  assert.equal((await action(id, a.cookie, 'publish')).status, 200);
  await checkArchive(`/api/downloads/${token}/archive`, '', originals);
  await checkArchive(ownerArchive, a.cookie, originals);
  if (process.env.SMOKE_LARGE_ARCHIVE === '1') {
    // Hold real HTTP responses open to exercise backpressure, the shared limit and TCP disconnects.
    const largePhoto = db().select().from(photos).where(eq(photos.id, originals[1].id)).get()!;
    const large = randomBytes(8 * 1024 * 1024);
    try {
      await put(largePhoto.originalKey, large, largePhoto.mime);
      db().$client.prepare('update photos set size=? where id=?').run(large.length, largePhoto.id);
      const controllers = Array.from({ length: 3 }, () => new AbortController());
      try {
        const held = await Promise.all(
          controllers.map((controller) =>
            fetch(new URL(`/api/downloads/${token}/archive`, origin), {
              signal: controller.signal,
            }),
          ),
        );
        assert.ok(
          held.every((response) => response.status === 200),
          'Три медленных ZIP',
        );
        assert.equal((await req(`/api/downloads/${token}/archive`)).status, 429, 'Лимит ZIP');
      } finally {
        controllers.forEach((controller) => controller.abort());
      }
      async function waitForSlot() {
        for (let i = 0; i < 100; i++) {
          const controller = new AbortController();
          const response = await fetch(new URL(`/api/downloads/${token}/archive`, origin), {
            signal: controller.signal,
          });
          controller.abort();
          if (response.status === 200) return;
          assert.equal(response.status, 429);
          await new Promise((resolve) => setTimeout(resolve, 30));
        }
        throw new Error('Слот ZIP не освобождён');
      }
      await waitForSlot();
      await new Promise<void>((resolve, reject) => {
        const request = httpGet(new URL(`/api/downloads/${token}/archive`, origin), (response) => {
          if (response.statusCode !== 200) {
            reject(new Error('ZIP после отмены недоступен'));
            response.destroy();
            return;
          }
          response.once('data', () => {
            response.destroy();
            request.destroy();
            resolve();
          });
        });
        request.once('error', reject);
      });
      await waitForSlot();
      const continuing = await req(`/api/downloads/${token}/archive`);
      assert.equal(continuing.status, 200);
      assert.equal((await action(id, a.cookie, 'unpublish')).status, 200);
      assert.equal((await req(`/api/downloads/${token}/archive`)).status, 404);
      assert.equal((await action(id, a.cookie, 'delete', { confirm: 'yes' })).status, 409);
      const completedZip = Buffer.from(await continuing.arrayBuffer());
      assert.ok(
        completedZip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x06, 0x06])) > 0,
        'ZIP завершён после unpublish',
      );
      assert.equal((await action(id, a.cookie, 'publish')).status, 200);
    } finally {
      await put(largePhoto.originalKey, originals[1].data, largePhoto.mime);
      db()
        .$client.prepare('update photos set size=? where id=?')
        .run(largePhoto.size, largePhoto.id);
    }
  }
  const publicPage = await req(`/g/${token}`);
  assert.equal(publicPage.status, 200);
  const html = await publicPage.text();
  assert.match(html, /Checkpoint &lt;история(?:&gt;|>)/);
  assert.ok(html.includes('Скачать оригинал'));
  assert.ok(html.includes('Скачать все фотографии ZIP'));
  assert.ok(!html.includes(a.email));
  assert.match(publicPage.headers.get('cache-control')!, /no-store/);
  const refreshed = await req(`/g/${token}/previews`);
  assert.equal(refreshed.status, 200);
  assert.match(refreshed.headers.get('cache-control')!, /no-store/);
  const refreshedPhotos = (await refreshed.json()).photos as {
    id: string;
    url: string;
    thumbnailUrl: string;
  }[];
  assert.equal(refreshedPhotos.length, originals.length);
  assert.ok(
    refreshedPhotos.every(
      (photo) => new URL(photo.url).searchParams.get('X-Amz-Expires') === '120',
    ),
  );
  assert.ok(refreshedPhotos.every((photo) => photo.thumbnailUrl !== photo.url));
  const retriedPreview = new URL(refreshedPhotos[0].url);
  retriedPreview.hash = 'viewport-retry-1';
  assert.ok((await fetch(retriedPreview)).ok, 'Повтор превью не меняет подпись S3');
  const themeResponse = await req(
    `/g/${token}?/theme`,
    '',
    new URLSearchParams({ theme: 'light' }),
  );
  assert.equal(themeResponse.status, 303);
  const themeCookie = themeResponse.headers.getSetCookie()[0].split(';')[0];
  const themedPage = await req(`/g/${token}`, themeCookie);
  assert.equal(themedPage.status, 200);
  assert.ok(!(await themedPage.text()).includes('public-gallery dark'));
  assert.equal(
    (await action(id, a.cookie, 'move', { photoId: originals[0].id, direction: 'down' })).status,
    409,
  );
  assert.equal(
    (await req('/api/uploads/confirm', a.cookie, { photoId: originals[0].id })).status,
    409,
  );
  for (const original of originals) {
    const response = await req(`/api/downloads/${token}/${original.id}`);
    assert.equal(response.status, 302);
    const downloaded = await fetch(response.headers.get('location')!);
    assert.ok(downloaded.ok);
    assert.equal(
      hash(new Uint8Array(await downloaded.arrayBuffer())),
      hash(original.data),
      'Hash исходника',
    );
    assert.match(downloaded.headers.get('content-disposition')!, /filename\*=UTF-8/i);
  }
  const otherId = await create(b.cookie, 'Другая');
  assert.equal((await req(ownerDownload(otherId, originals[0].id), b.cookie)).status, 404);
  assert.equal((await req(ownerDownload(id, originals[0].id), a.cookie)).status, 302);
  assert.equal((await req(`/api/downloads/${token}/${otherId}`)).status, 404);
  assert.equal((await action(id, a.cookie, 'unpublish')).status, 200);
  assert.equal((await req(`/g/${token}`)).status, 404);
  assert.equal((await req(`/api/downloads/${token}/archive`)).status, 404);
  await checkArchive(ownerArchive, a.cookie, originals);
  assert.equal((await req(`/g/${token}/previews`)).status, 404);
  assert.equal((await req('/g/unknown/previews')).status, 404);
  assert.equal((await req(`/api/downloads/${token}/${originals[0].id}`)).status, 404);
  assert.equal((await req(ownerDownload(id, originals[0].id), a.cookie)).status, 302);
  assert.equal((await req('/g/unknown')).status, 404);

  const pagedId = await create(a.cookie, 'Порционная галерея');
  const pageImage = await input.clone().png().toBuffer();
  for (let index = 0; index < 25; index++)
    await upload(pagedId, a.cookie, pageImage, `page-${index}.png`, 'image/png');
  assert.equal((await req(`/dashboard/galleries/${pagedId}/preview`, b.cookie)).status, 404);
  assert.equal(
    (await req(`/dashboard/galleries/${pagedId}/previews?offset=24`, b.cookie)).status,
    404,
  );
  const ownedBatch = await req(`/dashboard/galleries/${pagedId}/previews?offset=24`, a.cookie);
  assert.equal(ownedBatch.status, 200);
  assert.equal(((await ownedBatch.json()).photos as unknown[]).length, 1);
  assert.equal((await action(pagedId, a.cookie, 'publish')).status, 200);
  const pagedToken = db().select().from(galleries).where(eq(galleries.id, pagedId)).get()!.token!;
  const firstPage = await req(`/g/${pagedToken}`);
  assert.equal(firstPage.status, 200);
  const firstHtml = await firstPage.text();
  assert.equal((firstHtml.match(/class="photo-preview"/g) ?? []).length, 24);
  assert.match(firstHtml, /page=2/);
  const secondPage = await req(`/g/${pagedToken}?page=2`);
  assert.equal(secondPage.status, 200);
  assert.equal(((await secondPage.text()).match(/class="photo-preview"/g) ?? []).length, 1);
  const firstBatch = (await (await req(`/g/${pagedToken}/previews?limit=24`)).json()).photos as {
    id: string;
  }[];
  const nextBatchResponse = await req(
    `/g/${pagedToken}/previews?offset=24&limit=24&after=${firstBatch.at(-1)!.id}`,
  );
  assert.equal(nextBatchResponse.status, 200);
  assert.equal(((await nextBatchResponse.json()).photos as unknown[]).length, 1);
  assert.equal((await req(`/g/${pagedToken}/previews?offset=24&after=wrong`)).status, 409);
  assert.equal((await req(`/g/${pagedToken}/previews?limit=97`)).status, 400);
  assert.equal((await action(pagedId, a.cookie, 'unpublish')).status, 200);
  assert.equal((await req(`/g/${pagedToken}/previews?offset=24`)).status, 404);

  assert.equal((await req('/logout', a.cookie, new URLSearchParams())).status, 303);
  assert.equal(
    (await req('/dashboard', a.cookie)).status,
    303,
    'Сессия после выхода недействительна',
  );
  const login = await req(
    '/login',
    '',
    new URLSearchParams({ email: a.email, password, mode: 'login' }),
  );
  assert.equal(login.status, 303, 'Вход через HTML форму без JS');
  const restoredCookie = login.headers
    .getSetCookie()
    .map((v) => v.split(';')[0])
    .join('; ');
  assert.equal((await req('/dashboard', restoredCookie)).status, 200);
  const invitedEmail = `invite-${randomUUID()}@example.test`;
  const deniedRegistration = await req(
    '/login',
    '',
    new URLSearchParams({
      mode: 'register',
      name: 'Без приглашения',
      email: invitedEmail,
      password,
      inviteCode: 'wrong-invite',
    }),
  );
  assert.equal(deniedRegistration.status, 403, 'HTML-регистрация требует invite');
  assert.ok(
    !db().select().from(user).where(eq(user.email, invitedEmail)).get(),
    'Отказ не создаёт аккаунт',
  );
  let limited = false;
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await fetch(new URL('/login', origin), {
      method: 'POST',
      headers: {
        Origin: origin,
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Forwarded-For': `192.0.2.${attempt + 1}`,
        'x-viewport-client-ip': `192.0.2.${attempt + 20}`,
      },
      body: new URLSearchParams({ email: a.email, password: 'wrong-password', mode: 'login' }),
    });
    if (response.status === 429) {
      assert.ok(Number(response.headers.get('retry-after')) > 0);
      limited = true;
      break;
    }
    assert.equal(response.status, 400);
  }
  assert.ok(limited, 'HTML-вход ограничен, заголовки IP не обходят rate limit');
  assert.equal(
    (await req('/api/auth/sign-in/email', '', { email: a.email, password: 'wrong-password' }))
      .status,
    429,
    'API делит лимитер с HTML-формой',
  );
  console.log(
    'Smoke: invite, общий rate limit HTML/API, S3 ограничивает размер PUT; auth → галерея → Sharp → публикация → оригиналы JPEG/PNG/WebP и ZIP; права, конкурентные операции, просроченная подпись, CORS, hash, unpublish, cleanup — OK.',
  );
} finally {
  // Delete only test owners and their server-generated keys; never touch demonstration data.
  for (const owner of owners) {
    const gs = db().select().from(galleries).where(eq(galleries.userId, owner)).all();
    for (const g of gs) {
      const ps = db().select().from(photos).where(eq(photos.galleryId, g.id)).all();
      for (const p of ps)
        for (const key of [
          p.uploadKey,
          p.originalKey,
          p.originalKey.replace('/originals/', '/previews/') + '.webp',
          p.originalKey.replace('/originals/', '/thumbnails/') + '.webp',
        ])
          await remove(key);
      atomic(() => {
        if (ps.length) {
          db()
            .delete(reservations)
            .where(
              inArray(
                reservations.photoId,
                ps.map((p) => p.id),
              ),
            )
            .run();
          db().delete(photos).where(eq(photos.galleryId, g.id)).run();
        }
        db().delete(galleries).where(eq(galleries.id, g.id)).run();
      });
    }
    atomic(() => {
      db().delete(session).where(eq(session.userId, owner)).run();
      db().delete(account).where(eq(account.userId, owner)).run();
      db().delete(user).where(eq(user.id, owner)).run();
    });
  }
  db().$client.close();
}
