import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
let content = readFileSync(existsSync('.env') ? '.env' : '.env.example', 'utf8');
for (const key of ['BETTER_AUTH_SECRET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY']) {
  const match = content.match(new RegExp(`^${key}=(.*)$`, 'm'));
  if (!match || !match[1].trim() || /replace|example/i.test(match[1])) {
    const line = `${key}=${randomBytes(32).toString('hex')}`;
    content = match ? content.replace(match[0], line) : `${content}\n${line}\n`;
  }
}
writeFileSync('.env', content, { mode: 0o600 });
console.log('Локальная конфигурация готова.');
