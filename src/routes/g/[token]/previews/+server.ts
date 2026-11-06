import { error, json } from '@sveltejs/kit';
import {
  publicGallery,
  photoViews,
  readyPhotoPage,
  coverView,
} from '#lib/server/galleries/index.ts';

export const GET: import('./$types').RequestHandler = async ({ params, url }) => {
  const gallery = publicGallery(params.token);
  const offset = Number(url.searchParams.get('offset') ?? '0');
  const limit = Number(url.searchParams.get('limit') ?? '24');
  if (
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 96
  )
    error(400, 'Неверная страница');
  const after = url.searchParams.get('after');
  if (offset > 0 && after && readyPhotoPage(gallery.id, offset - 1, 1)[0]?.id !== after)
    error(409, 'Состав галереи изменился');
  const photos = await photoViews(gallery.id, offset, limit);
  const cover = await coverView(gallery.id, gallery.coverId);
  // Publication may have changed while S3 URLs were being signed.
  publicGallery(params.token);
  const current = readyPhotoPage(gallery.id, offset, limit);
  if (current.length !== photos.length || current.some((photo, i) => photo.id !== photos[i].id))
    error(409, 'Состав галереи изменился. Обновите страницу.');
  return json({ photos, cover });
};
