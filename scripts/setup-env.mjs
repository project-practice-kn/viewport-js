import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
let content = readFileSync(existsSync('.env') ? '.env' : '.env.example', 'utf8');
for (const key of [
  'BETTER_AUTH_SECRET',
  'REGISTRATION_INVITE_CODE',
  'S3_ACCESS_KEY_ID',
  'S3_SECRET_ACCESS_KEY',
]) {
  const match = content.match(new RegExp(`^${key}=(.*)$`, 'm'));
  const placeholder = key === 'REGISTRATION_INVITE_CODE' ? /replace-with/i : /replace|example/i;
  if (!match || !match[1].trim() || placeholder.test(match[1])) {
    const line = `${key}=${randomBytes(32).toString('hex')}`;
    content = match ? content.replace(match[0], line) : `${content}\n${line}\n`;
  }
}
writeFileSync('.env', content, { mode: 0o600 });
console.log('Локальная конфигурация готова.');
