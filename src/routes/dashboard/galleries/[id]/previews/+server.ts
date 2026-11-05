import { json, error } from '@sveltejs/kit';
import { requireUser } from '#lib/server/auth/index.ts';
import { owned, photoViews, readyPhotos } from '#lib/server/galleries/index.ts';
export const GET: import('./$types').RequestHandler = async ({ locals, params }) => {
  const user = requireUser(locals);
  owned(user.id, params.id);
  const photos = await photoViews(params.id);
  owned(user.id, params.id);
  const current = readyPhotos(params.id);
  if (current.length !== photos.length || current.some((p, i) => p.id !== photos[i].id))
    error(409, 'Состав галереи изменился');
  return json({ photos: photos.map(({ id, url }) => ({ id, url })) });
};
