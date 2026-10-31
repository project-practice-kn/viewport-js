import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
const folder = mkdtempSync(join(tmpdir(), 'viewport-test-'));
process.env.DATABASE_PATH = join(folder, 'test.db');
process.env.USER_STORAGE_QUOTA_BYTES = '100';
const { db, openDatabase } = await import('../src/lib/server/db/index.ts');
const { user, photos, reservations, galleries } = await import('../src/lib/server/db/schema.ts');
const service = await import('../src/lib/server/galleries/index.ts');
const uploads = await import('../src/lib/server/photos/index.ts');
const { safeFilename } = await import('../src/lib/server/storage/index.ts');
const database = db();
migrate(database, { migrationsFolder: './drizzle' });
const now = new Date();
for (const id of ['owner', 'other'])
  database
    .insert(user)
    .values({ id, email: `${id}@test.invalid`, name: id, createdAt: now, updatedAt: now })
    .run();
const form = (title: string) => {
  const data = new FormData();
  data.set('title', title);
  return data;
};
const httpError = (status: number) => (e: unknown) =>
  !!e && typeof e === 'object' && 'status' in e && e.status === status;
after(() => {
  database.$client.close();
  rmSync(folder, { recursive: true, force: true });
});
test('Миграции повторяемы, WAL/FK включены, данные сохраняются', () => {
  migrate(database, { migrationsFolder: './drizzle' });
  const second = openDatabase(process.env.DATABASE_PATH);
  assert.equal(second.$client.pragma('journal_mode', { simple: true }), 'wal');
  assert.equal(second.$client.pragma('foreign_keys', { simple: true }), 1);
  assert.equal(
    second.$client.prepare('select count(*) as n from users').get() &&
      second.select().from(user).all().length,
    2,
  );
  second.$client.close();
});
test('Владелец, валидация полей и атомарная квота', () => {
  assert.throws(() => service.create('owner', form('  ')), httpError(400));
  assert.throws(() => service.create('owner', form('x'.repeat(121))), httpError(400));
  const id = service.create('owner', form('История'));
  assert.throws(() => service.owned('other', id), httpError(404));
  assert.equal(service.list('other').length, 0);
  const fields = form('Новое имя');
  fields.set('theme', 'injected');
  assert.throws(() => service.edit('owner', id, fields), httpError(400));
  fields.set('theme', 'dark');
  fields.set('description', '<script>text</script>');
  service.edit('owner', id, fields);
  assert.equal(service.owned('owner', id).theme, 'dark');
  const [photo] = uploads.reserve('owner', id, [{ name: 'фото.png', size: 60, type: 'image/png' }]);
  assert.equal(uploads.usage('owner').reserved, 60);
  assert.throws(
    () => uploads.reserve('owner', id, [{ name: 'x.png', size: 41, type: 'image/png' }]),
    httpError(409),
  );
  assert.throws(() => uploads.cancel('other', photo.id), httpError(404));
  uploads.cancel('owner', photo.id);
  uploads.cancel('owner', photo.id);
  assert.equal(uploads.usage('owner').reserved, 0); // Failed photos cannot be accepted again; cleanup retains durable keys.
  database.$client
    .prepare("update upload_reservations set status='released' where photo_id=?")
    .run(photo.id);
  assert.equal(uploads.usage('owner').reserved, 0);
  assert.throws(
    () => uploads.reserve('owner', id, [{ name: 'bad', size: -1, type: 'image/png' }]),
    httpError(400),
  );
  assert.throws(
    () => uploads.reserve('owner', id, [{ name: 'bad', size: 1, type: 'text/plain' }]),
    httpError(400),
  );
  assert.throws(() => service.publish('owner', id), httpError(409));
});
test('SQLite запрещает сироты, отрицательный размер и ready без превью', () => {
  const id = service.create('owner', form('Constraints'));
  assert.throws(() =>
    database.$client.prepare("update galleries set status='published' where id=?").run(id),
  );
  assert.throws(() =>
    database.$client.prepare("update galleries set theme='other' where id=?").run(id),
  );
  const [p] = uploads.reserve('owner', id, [{ name: 'x.png', size: 1, type: 'image/png' }]);
  for (const update of [
    'preview_size=-1',
    'width=-1',
    'position=-1',
    'size=-1',
    "status='ready'",
    "status='ready',preview_key='x'",
    "gallery_id='missing'",
  ])
    assert.throws(() =>
      database.$client.prepare(`update photos set ${update} where id=?`).run(p.id),
    );
  database.$client
    .prepare("update upload_reservations set status='released' where photo_id=?")
    .run(p.id);
});
test('Lifecycle, обложка, точный порядок, защита published и публичного доступа', () => {
  const id = service.create('owner', form('Публичная история'));
  const batch = uploads.reserve('owner', id, [
    { name: 'a.png', size: 5, type: 'image/png' },
    { name: 'b.png', size: 5, type: 'image/png' },
  ]);
  const sql = database.$client;
  for (const p of batch) {
    sql
      .prepare(
        "update photos set status='ready',preview_key=?,width=10,height=10,preview_size=10 where id=?",
      )
      .run(`${p.id}.webp`, p.id);
    sql.prepare("update upload_reservations set status='completed' where photo_id=?").run(p.id);
  }
  assert.throws(() => service.cover('owner', id, 'foreign'), httpError(400));
  service.cover('owner', id, batch[0].id);
  assert.throws(() => service.reorder('owner', id, [batch[0].id]), httpError(400));
  assert.throws(() => service.reorder('owner', id, [batch[0].id, batch[0].id]), httpError(400));
  service.reorder('owner', id, [batch[1].id, batch[0].id]);
  assert.equal(service.readyPhotos(id)[0].id, batch[1].id);
  const token = service.publish('owner', id)!;
  assert.equal(token.length, 43);
  assert.equal(service.publish('owner', id), token);
  assert.equal(service.publicGallery(token).id, id);
  assert.throws(() => service.edit('owner', id, form('blocked')), httpError(409));
  assert.throws(() => service.cover('owner', id, batch[1].id), httpError(409));
  assert.throws(
    () => uploads.reserve('owner', id, [{ name: 'x.png', size: 1, type: 'image/png' }]),
    httpError(409),
  );
  service.unpublish('owner', id);
  service.unpublish('owner', id);
  assert.throws(() => service.publicGallery(token), httpError(404));
  assert.throws(() => service.publicGallery('unknown'), httpError(404));
  assert.equal(database.select().from(galleries).all().length > 0, true);
  assert.equal(database.select().from(photos).all().length > 0, true);
  assert.equal(database.select().from(reservations).all().length > 0, true);
});
test('Имена скачиваний не содержат путей и управляющих символов', () => {
  assert.equal(safeFilename('../портрет\r\n.png'), '_портрет__.png');
  assert.equal(safeFilename(''), 'photo');
});

test('Sharp: все форматы, EXIF rotation, прозрачность, повреждение и лимит пикселей', async () => {
  const input = sharp({
    create: { width: 90, height: 60, channels: 4, background: { r: 1, g: 2, b: 3, alpha: 0.3 } },
  });
  for (const format of ['jpeg', 'png', 'webp'] as const) {
    const original = await input.clone().toFormat(format).toBuffer();
    const unchanged = Buffer.from(original);
    const preview = await uploads.createPreview(original, `image/${format}`);
    assert.deepEqual(original, unchanged);
    const meta = await sharp(preview.data).metadata();
    assert.equal(meta.format, 'webp');
    assert.equal(meta.exif, undefined);
    if (format !== 'jpeg') assert.equal(meta.hasAlpha, true);
    await assert.rejects(() => uploads.createPreview(original.subarray(0, 25), `image/${format}`));
  }
  const rotated = await input.clone().jpeg().withMetadata({ orientation: 6 }).toBuffer();
  const preview = await uploads.createPreview(rotated, 'image/jpeg');
  assert.equal(preview.info.width, 60);
  assert.equal(preview.info.height, 90);
  assert.equal((await sharp(preview.data).metadata()).orientation, undefined);
  await assert.rejects(() => uploads.createPreview(Buffer.from('corrupted'), 'image/png'));
  await assert.rejects(() => uploads.createPreview(rotated, 'image/png'));
  process.env.MAX_IMAGE_PIXELS = '100';
  try {
    await assert.rejects(() => uploads.createPreview(rotated, 'image/jpeg'));
  } finally {
    delete process.env.MAX_IMAGE_PIXELS;
  }
});

test('S3: подпись использует публичный endpoint независимо от внутреннего адреса', async () => {
  process.env.S3_ENDPOINT = 'http://s3:8333';
  process.env.S3_PUBLIC_ENDPOINT = 'http://localhost:8333';
  process.env.S3_ACCESS_KEY_ID ||= 'test-access';
  process.env.S3_SECRET_ACCESS_KEY ||= 'test-secret';
  const { presignPut, presignGet } = await import('../src/lib/server/storage/index.ts');
  assert.equal(
    new URL(await presignPut('test/photo', 'image/png', 123, 60)).origin,
    'http://localhost:8333',
  );
  assert.equal(new URL(await presignGet('test/photo')).origin, 'http://localhost:8333');
  const url = new URL(await presignPut('test/photo', 'image/png', 123, 60));
  assert.ok(url.searchParams.get('X-Amz-SignedHeaders')?.split(';').includes('content-length'));
  assert.ok(url.searchParams.get('X-Amz-SignedHeaders')?.split(';').includes('content-type'));
});

test('Лимиты по умолчанию: 10 МиБ на файл, 5 ГиБ на пользователя', () => {
  const quota = process.env.USER_STORAGE_QUOTA_BYTES;
  const maxFile = process.env.MAX_FILE_SIZE_BYTES;
  delete process.env.USER_STORAGE_QUOTA_BYTES;
  delete process.env.MAX_FILE_SIZE_BYTES;
  try {
    assert.equal(uploads.usage('other').quota, 5 * 1024 ** 3);
    const id = service.create('other', form('Границы размера'));
    assert.throws(
      () =>
        uploads.reserve('other', id, [
          { name: 'large.png', size: 10 * 1024 ** 2 + 1, type: 'image/png' },
        ]),
      httpError(400),
    );
    const [photo] = uploads.reserve('other', id, [
      { name: 'exact.png', size: 10 * 1024 ** 2, type: 'image/png' },
    ]);
    uploads.cancel('other', photo.id);
  } finally {
    if (quota === undefined) delete process.env.USER_STORAGE_QUOTA_BYTES;
    else process.env.USER_STORAGE_QUOTA_BYTES = quota;
    if (maxFile === undefined) delete process.env.MAX_FILE_SIZE_BYTES;
    else process.env.MAX_FILE_SIZE_BYTES = maxFile;
  }
});

test('Invite: неверный/отсутствующий код и пустая конфигурация закрывают регистрацию', async () => {
  const { assertInviteCode } = await import('../src/lib/server/auth/invite.ts');
  const original = process.env.REGISTRATION_INVITE_CODE;
  try {
    process.env.REGISTRATION_INVITE_CODE = randomUUID();
    assert.doesNotThrow(() => assertInviteCode(process.env.REGISTRATION_INVITE_CODE));
    for (const value of [undefined, null, '', 'wrong', {}, ['wrong']])
      assert.throws(
        () => assertInviteCode(value),
        (error: unknown) =>
          !!error && typeof error === 'object' && 'statusCode' in error && error.statusCode === 403,
      );
    delete process.env.REGISTRATION_INVITE_CODE;
    assert.throws(
      () => assertInviteCode('anything'),
      (error: unknown) =>
        !!error && typeof error === 'object' && 'statusCode' in error && error.statusCode === 503,
    );
    process.env.REGISTRATION_INVITE_CODE = 'replace-with-a-random-invite-code';
    assert.throws(() => assertInviteCode('replace-with-a-random-invite-code'));
  } finally {
    if (original === undefined) delete process.env.REGISTRATION_INVITE_CODE;
    else process.env.REGISTRATION_INVITE_CODE = original;
  }
});

test('Auth: invite нельзя обойти через API, лимитер общий для API и HTML-формы, IP не подменяется', async () => {
  const { handleAuthRequest } = await import('../src/lib/server/auth/index.ts');
  const { actions } = await import('../src/routes/login/+page.server.ts');
  const { origin } = await import('../src/lib/server/config.ts');
  const previous = process.env.REGISTRATION_INVITE_CODE;
  const inviteCode = randomUUID();
  const email = `auth-${randomUUID()}@example.test`;
  const password = randomUUID() + 'Aa1!';
  const fields = { name: 'Проверка', email, password };
  const request = (path: string, body: unknown) =>
    new Request(new URL(path, origin()), {
      method: 'POST',
      headers: {
        Origin: origin(),
        'Content-Type': 'application/json',
        'X-Forwarded-For': randomUUID(),
        'x-viewport-client-ip': '192.0.2.250',
      },
      body: JSON.stringify(body),
    });
  try {
    process.env.REGISTRATION_INVITE_CODE = inviteCode;
    for (const [i, code] of [undefined, 'wrong'].entries()) {
      const response = await handleAuthRequest(
        request('/api/auth/sign-up/email', { ...fields, inviteCode: code }),
        `192.0.2.${10 + i}`,
      );
      assert.equal(response.status, 403);
      assert.equal(
        (
          database.$client.prepare('select count(*) as n from users where email=?').get(email) as {
            n: number;
          }
        ).n,
        0,
      );
    }
    delete process.env.REGISTRATION_INVITE_CODE;
    assert.equal(
      (
        await handleAuthRequest(
          request('/api/auth/sign-up/email', { ...fields, inviteCode }),
          '192.0.2.12',
        )
      ).status,
      503,
    );
    process.env.REGISTRATION_INVITE_CODE = inviteCode;
    const registered = await handleAuthRequest(
      request('/api/auth/sign-up/email', { ...fields, inviteCode }),
      '192.0.2.13',
    );
    assert.equal(registered.status, 200);
    assert.ok(!JSON.stringify(await registered.json()).includes(inviteCode));

    const responseHeaders: Record<string, string> = {};
    const formRequest = () =>
      actions.default({
        request: new Request(new URL('/login', origin()), {
          method: 'POST',
          headers: {
            Origin: origin(),
            'x-viewport-client-ip': randomUUID(),
            'X-Forwarded-For': randomUUID(),
          },
          body: new URLSearchParams({ email, password: 'wrong-password', mode: 'login' }),
        }),
        getClientAddress: () => '192.0.2.200',
        setHeaders: (headers: Record<string, string>) => Object.assign(responseHeaders, headers),
        cookies: { set() {} },
      } as unknown as Parameters<typeof actions.default>[0]);
    assert.equal((await formRequest())?.status, 400);
    assert.equal(
      (
        await handleAuthRequest(
          request('/api/auth/sign-in/email', { email, password: 'wrong-password' }),
          '192.0.2.200',
        )
      ).status,
      401,
    );
    assert.equal((await formRequest())?.status, 400);
    const blocked = await handleAuthRequest(
      request('/api/auth/sign-in/email', { email, password: 'wrong-password' }),
      '192.0.2.200',
    );
    assert.equal(blocked.status, 429);
    assert.ok(Number(blocked.headers.get('retry-after')) > 0);
    const formBlocked = await formRequest();
    assert.equal(formBlocked?.status, 429);
    assert.ok(Number(responseHeaders['Retry-After']) > 0);
    assert.ok(!JSON.stringify(formBlocked).includes(password));
  } finally {
    if (previous === undefined) delete process.env.REGISTRATION_INVITE_CODE;
    else process.env.REGISTRATION_INVITE_CODE = previous;
  }
});
