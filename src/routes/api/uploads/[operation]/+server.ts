import { json, error, isHttpError } from '@sveltejs/kit';
import * as uploads from '#lib/server/photos/index.ts';
export const POST: import('./$types').RequestHandler = async ({ locals, params, request }) => {
  if (!locals.user) error(401, 'Войдите в аккаунт');
  try {
    const body = await request.json();
    if (!body || typeof body !== 'object') error(400, 'Неверный запрос');
    if (params.operation === 'presign') {
      if (typeof body.galleryId !== 'string') error(400, 'Укажите галерею');
      return json({ uploads: await uploads.presign(locals.user.id, body.galleryId, body.files) });
    }
    if (typeof body.photoId !== 'string') error(400, 'Укажите фотографию');
    if (params.operation === 'confirm')
      return json(await uploads.confirm(locals.user.id, body.photoId));
    if (params.operation === 'cancel') {
      uploads.cancel(locals.user.id, body.photoId);
      return json({ status: 'cancelled' });
    }
    error(404, 'Не найдено');
  } catch (e) {
    if (isHttpError(e)) throw e;
    if (e instanceof SyntaxError) error(400, 'Неверный JSON');
    error(503, 'Хранилище временно недоступно. Повторите запрос');
  }
};
