import { mkdir, readFile, writeFile, copyFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { s3, bucket, put } from '../src/lib/server/storage/index.ts';
import { openDatabase } from '../src/lib/server/db/index.ts';
import { setting } from '../src/lib/server/config.ts';
const [mode, directory] = process.argv.slice(2);
if (!directory || !['export', 'import'].includes(mode))
  throw new Error('Укажите export/import и каталог переноса');
const hash = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');
type Entry = { key: string; file: string; mime: string; hash: string };
if (mode === 'export') {
  await mkdir(directory, { recursive: true });
  const database = openDatabase();
  await database.$client.backup(join(directory, 'viewport.db'));
  database.$client.close();
  const entries: Entry[] = [];
  let continuation: string | undefined;
  do {
    const page = await s3().send(
      new ListObjectsV2Command({ Bucket: bucket(), ContinuationToken: continuation }),
    );
    for (const object of page.Contents ?? []) {
      const result = await s3().send(new GetObjectCommand({ Bucket: bucket(), Key: object.Key! }));
      const data = await result.Body!.transformToByteArray();
      const file = `${entries.length}.bin`;
      await writeFile(join(directory, file), data);
      entries.push({
        key: object.Key!,
        file,
        mime: result.ContentType || 'application/octet-stream',
        hash: hash(data),
      });
    }
    continuation = page.NextContinuationToken;
  } while (continuation);
  await writeFile(join(directory, 'manifest.json'), JSON.stringify(entries));
  console.log(`Экспортирована SQLite и объектов S3: ${entries.length}`);
} else {
  const path = setting('DATABASE_PATH');
  const exists = await access(path).then(
    () => true,
    () => false,
  );
  if (exists) throw new Error('Целевая SQLite уже существует; импорт отменён');
  const entries: Entry[] = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'));
  const existing = await s3().send(new ListObjectsV2Command({ Bucket: bucket(), MaxKeys: 1 }));
  if (existing.Contents?.length) throw new Error('Целевой bucket не пуст; импорт отменён');
  for (const entry of entries) {
    if (!/^\d+\.bin$/.test(entry.file)) throw new Error('Некорректный манифест');
    const data = await readFile(join(directory, entry.file));
    if (hash(data) !== entry.hash) throw new Error('Контрольная сумма экспорта не совпадает');
    await put(entry.key, data, entry.mime);
    const saved = await s3().send(new GetObjectCommand({ Bucket: bucket(), Key: entry.key }));
    if (hash(await saved.Body!.transformToByteArray()) !== entry.hash)
      throw new Error('Контрольная сумма S3 не совпадает');
  }
  await copyFile(join(directory, 'viewport.db'), path);
  console.log(`Перенесена SQLite и объектов S3: ${entries.length}; хэши совпадают.`);
}
