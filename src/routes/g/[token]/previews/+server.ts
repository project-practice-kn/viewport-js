import { error, json } from '@sveltejs/kit';
import { publicGallery, photoViews, readyPhotos } from '#lib/server/galleries/index.ts';

export const GET: import('./$types').RequestHandler = async ({ params }) => {
  const gallery = publicGallery(params.token);
  const photos = await photoViews(gallery.id);
  // Publication may have changed while S3 URLs were being signed.
  publicGallery(params.token);
  const current = readyPhotos(gallery.id);
  if (current.length !== photos.length || current.some((photo, i) => photo.id !== photos[i].id))
    error(409, 'Состав галереи изменился. Обновите страницу.');
  return json({ photos: photos.map(({ id, url }) => ({ id, url })) });
};
