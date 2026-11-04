import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mock } from 'node:test';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

const folder = mkdtempSync(join(tmpdir(), 'viewport-delete-'));
process.env.DATABASE_PATH = join(folder, 'db.sqlite');
const { db } = await import('../src/lib/server/db/index.ts');
const { user } = await import('../src/lib/server/db/schema.ts');
const galleries = await import('../src/lib/server/galleries/index.ts');
const uploads = await import('../src/lib/server/photos/index.ts');
const storage = await import('../src/lib/server/storage/index.ts');
const database = db();
const keys: string[] = [];
try {
  migrate(database, { migrationsFolder: './drizzle' });
  const now = new Date();
  const owner = randomUUID();
  database
    .insert(user)
    .values({
      id: owner,
      name: 'Test',
      email: `${owner}@example.test`,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  const form = new FormData();
  form.set('title', 'Проверка удаления');
  const id = galleries.create(owner, form);
  const [photo] = uploads.reserve(owner, id, [{ name: 'x.png', size: 1, type: 'image/png' }]);
  const preview = photo.originalKey.replace('/originals/', '/previews/') + '.webp';
  keys.push(photo.uploadKey, photo.originalKey, preview);
  for (const key of keys) await storage.put(key, Buffer.from('x'), 'image/png');
  database.$client
    .prepare(
      "update photos set status='ready',preview_key=?,width=1,height=1,preview_size=1 where id=?",
    )
    .run(preview, photo.id);
  database.$client
    .prepare("update upload_reservations set status='completed',expires_at=? where photo_id=?")
    .run(Date.now() - 1, photo.id);
  const client = storage.s3();
  const original = client.send.bind(client);
  let calls = 0;
  const stub = mock.method(client, 'send', (async (...args: Parameters<typeof client.send>) => {
    if (++calls === 2) throw new Error('injected delete failure');
    return original(...args);
  }) as typeof client.send);
  try {
    await assert.rejects(
      galleries.remove(owner, id),
      (e: unknown) => !!e && typeof e === 'object' && 'status' in e && e.status === 503,
    );
    assert.equal(galleries.owned(owner, id, false, true).deleting, true);
  } finally {
    stub.mock.restore();
  }
  await galleries.remove(owner, id);
  for (const key of keys)
    await assert.rejects(
      storage.head(key),
      (e: unknown) =>
        !!e &&
        typeof e === 'object' &&
        '$metadata' in e &&
        (e.$metadata as { httpStatusCode: number }).httpStatusCode === 404,
    );
  assert.equal(
    (database.$client.prepare('select count(*) n from photos').get() as { n: number }).n,
    0,
  );
  assert.equal(
    (database.$client.prepare('select count(*) n from upload_reservations').get() as { n: number })
      .n,
    0,
  );
  console.log('Удаление реальных S3-объектов после сбоя и повторной попытки: успешно');
} finally {
  for (const key of keys) await storage.remove(key);
  database.$client.close();
  rmSync(folder, { recursive: true, force: true });
}
