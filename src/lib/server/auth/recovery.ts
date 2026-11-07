import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
/** Only the administrator CLI enables link generation; no credentials are printed. */
export async function deliverRecoveryLink(url: string) {
  const destination = process.env.RECOVERY_LINK_FILE;
  if (!destination) throw new Error('Восстановление выполняет организатор');
  const path = resolve(destination);
  if (path.includes('/static/') || path.includes('/build/'))
    throw new Error('Файл восстановления должен находиться вне публичных каталогов');
  const safe = url.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  await writeFile(
    path,
    `<!doctype html><html lang="ru"><meta charset="utf-8"><title>Восстановление доступа</title><p>Ссылка действует 30 минут и используется один раз.</p><a href="${safe}">Установить новый пароль</a></html>`,
    { mode: 0o600, flag: 'wx' },
  );
}
