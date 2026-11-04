import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import http from 'node:http';
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
  const [photo] = uploads.reserve(owner, id, [{ name: 'x.png', size: 2, type: 'image/png' }]);
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
  // Start the signed PUT before deleting the gallery, and finish it afterwards.
  const putUrl = await storage.presignPut(photo.uploadKey, 'image/png', 2, 300);
  let finishPut!: () => void;
  const latePut = new Promise<number>((resolve, reject) => {
    const request = http.request(
      putUrl,
      { method: 'PUT', headers: { 'content-type': 'image/png', 'content-length': '2' } },
      (response) => {
        response.resume();
        response.on('end', () => resolve(response.statusCode ?? 0));
      },
    );
    request.on('error', reject);
    request.write('a');
    finishPut = () => request.end('b');
  });
  await new Promise((resolve) => setTimeout(resolve, 100));
  await galleries.remove(owner, id);
  finishPut();
  assert.equal(await latePut, 200);
  assert.equal((await storage.head(photo.uploadKey)).ContentLength, 2);
  assert.ok(
    database.$client
      .prepare('select upload_key from deleted_uploads where upload_key=?')
      .get(photo.uploadKey),
  );
  await uploads.cleanupDeletedUploads(100);
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
  console.log('Отказ S3, повтор удаления и позднее завершение PUT: успешно');
} finally {
  for (const key of keys) await storage.remove(key);
  database.$client.close();
  rmSync(folder, { recursive: true, force: true });
}
