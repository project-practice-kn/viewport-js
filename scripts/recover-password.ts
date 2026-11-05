import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { auth } from '../src/lib/server/auth/index.ts';
import { origin } from '../src/lib/server/config.ts';
const [email, destination] = process.argv.slice(2);
if (!email || !destination) {
  console.error('Использование: recover-password.ts <email> <приватный HTML-файл>');
  process.exitCode = 1;
} else {
  process.env.RECOVERY_LINK_FILE = resolve(destination);
  try {
    if (existsSync(process.env.RECOVERY_LINK_FILE)) throw new Error();
    await auth().api.requestPasswordReset({
      body: { email, redirectTo: new URL('/reset-password', origin()).href },
    });
    if (!existsSync(process.env.RECOVERY_LINK_FILE)) throw new Error();
    console.log(
      'Приватный файл восстановления создан. Передайте его владельцу через доверенный канал и удалите после использования.',
    );
  } catch {
    console.error('Не удалось создать файл восстановления. Проверьте аккаунт, путь и доступ к БД.');
    process.exitCode = 1;
  }
}
