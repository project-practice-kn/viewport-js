import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
