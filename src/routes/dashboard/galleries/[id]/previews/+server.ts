import { json, error } from '@sveltejs/kit';
import { requireUser } from '#lib/server/auth/index.ts';
import { owned, photoViews, readyPhotoPage, coverView } from '#lib/server/galleries/index.ts';
export const GET: import('./$types').RequestHandler = async ({ locals, params, url }) => {
  const user = requireUser(locals);
  owned(user.id, params.id);
  const offset = Number(url.searchParams.get('offset') ?? '0');
  const limit = Number(url.searchParams.get('limit') ?? '24');
  if (
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 10000
  )
    error(400, 'Неверная страница');
  const after = url.searchParams.get('after');
  if (offset > 0 && after && readyPhotoPage(params.id, offset - 1, 1)[0]?.id !== after)
    error(409, 'Состав галереи изменился');
  const photos = await photoViews(params.id, offset, limit);
  const cover = await coverView(params.id, owned(user.id, params.id).coverId);
  owned(user.id, params.id);
  const current = readyPhotoPage(params.id, offset, limit);
  if (current.length !== photos.length || current.some((p, i) => p.id !== photos[i].id))
    error(409, 'Состав галереи изменился');
  return json({ photos, cover });
};
