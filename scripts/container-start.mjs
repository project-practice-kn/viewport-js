import { spawnSync } from 'node:child_process';
for (const file of ['scripts/migrate.ts', 'scripts/setup-s3.ts']) {
  const result = spawnSync(process.execPath, [file], { stdio: 'inherit', env: process.env });
  if (result.error || result.status !== 0) {
    console.error('Не удалось подготовить приложение. Проверьте SQLite и S3.');
    process.exit(1);
  }
}
const entrypoint = new URL('../build/index.js', import.meta.url).href;
await import(entrypoint);
