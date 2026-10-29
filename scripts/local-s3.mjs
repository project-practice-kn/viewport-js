import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
const executable = process.env.SEAWEEDFS_BINARY;
if (!executable) throw new Error('Укажите SEAWEEDFS_BINARY — путь к weed версии 4.48');
if (!process.env.S3_ACCESS_KEY_ID || !process.env.S3_SECRET_ACCESS_KEY)
  throw new Error('Сначала node scripts/setup-env.mjs');
mkdirSync('./data/s3', { recursive: true });
const child = spawn(
  executable,
  [
    'mini',
    '-dir=./data/s3',
    '-ip=127.0.0.1',
    '-ip.bind=127.0.0.1',
    '-admin.ui=false',
    '-webdav=false',
    '-volume.max=3',
  ],
  {
    env: {
      ...process.env,
      AWS_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID,
      AWS_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY,
    },
    stdio: 'inherit',
  },
);
child.on('spawn', () => writeFileSync('./data/local-s3.pid', String(child.pid)));
process.on('SIGTERM', () => child.kill('SIGTERM'));
process.on('SIGINT', () => child.kill('SIGINT'));
child.on('exit', (code) => {
  try {
    unlinkSync('./data/local-s3.pid');
  } catch {}
  process.exit(code ?? 0);
});
