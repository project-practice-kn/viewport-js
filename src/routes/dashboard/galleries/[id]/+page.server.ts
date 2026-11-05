import { fail, isHttpError, redirect, error } from '@sveltejs/kit';
import { requireUser } from '#lib/server/auth/index.ts';
import * as galleries from '#lib/server/galleries/index.ts';
import {
  usage,
  refreshGalleryUploads,
  confirm,
  cancel,
  assertUploadGallery,
} from '#lib/server/photos/index.ts';
export const load = async ({ locals, params, url }: import('./$types').PageServerLoadEvent) => {
  const user = requireUser(locals, url),
    gallery = galleries.owned(user.id, params.id, false, true);
  const uploads = gallery.deleting ? [] : await refreshGalleryUploads(user.id, gallery.id);
  return {
    gallery: {
      id: gallery.id,
      title: gallery.title,
      description: gallery.description,
      theme: gallery.theme,
      status: gallery.status,
      deleting: gallery.deleting,
      coverId: gallery.coverId,
      link: gallery.status === 'published' ? new URL(`/g/${gallery.token}`, url.origin).href : null,
    },
    photos: gallery.deleting ? [] : await galleries.photoViews(gallery.id),
    usage: usage(user.id),
    uploads,
    deletingPhotos: galleries.deletingPhotos(user.id, gallery.id),
  };
};
type Event = import('./$types').RequestEvent;
function action(
  operation: (userId: string, id: string, data: FormData) => unknown,
  message: string,
) {
  return async ({ locals, params, request, url }: Event) => {
    const user = requireUser(locals, url),
      data = await request.formData();
    try {
      await operation(user.id, params.id, data);
      return { message, success: true };
    } catch (e) {
      if (isHttpError(e))
        return fail(e.status, {
          message: e.body.message,
          success: false,
          values: Object.fromEntries(data),
        });
      throw e;
    }
  };
}
export const actions = {
  delete: async ({ locals, params, request, url }: Event) => {
    const user = requireUser(locals, url);
    const data = await request.formData();
    if (data.get('confirm') !== 'yes')
      return fail(400, { message: 'Подтвердите удаление галереи', success: false });
    try {
      await galleries.remove(user.id, params.id);
    } catch (e) {
      if (isHttpError(e)) return fail(e.status, { message: e.body.message, success: false });
      throw e;
    }
    redirect(303, '/dashboard');
  },
  save: action(galleries.edit, 'Настройки сохранены'),
  removePhotos: action((u, id, d) => {
    if (d.get('confirmPhotos') !== 'yes') error(400, 'Подтвердите удаление фотографий');
    return galleries.removePhotos(u, id, d.getAll('selected').map(String));
  }, 'Выбранные фотографии удалены'),
  sort: action(galleries.sortByName, 'Фотографии отсортированы по имени'),
  moveMany: action(
    (u, id, d) =>
      galleries.moveMany(u, id, d.getAll('selected').map(String), String(d.get('target'))),
    'Выбранные фотографии перемещены',
  ),
  rotateLink: action((u, id, d) => {
    if (d.get('confirmLink') !== 'yes') error(400, 'Подтвердите смену ссылки');
    return galleries.rotateLink(u, id);
  }, 'Новая ссылка готова. Старая ссылка больше не открывает галерею'),
  confirmUpload: action((u, id, d) => {
    const p = String(d.get('photoId'));
    assertUploadGallery(u, id, p);
    return confirm(u, p);
  }, 'Проверка фотографии завершена'),
  cancelUpload: action((u, id, d) => {
    const p = String(d.get('photoId'));
    assertUploadGallery(u, id, p);
    return cancel(u, p);
  }, 'Загрузка отменена'),
  publish: action(galleries.publish, 'Галерея опубликована. Отправьте ссылку клиенту'),
  unpublish: action(galleries.unpublish, 'Публикация снята. Можно редактировать галерею'),
  cover: action(
    (u, id, d) => galleries.cover(u, id, String(d.get('photoId'))),
    'Обложка обновлена',
  ),
  move: action(
    (u, id, d) => galleries.move(u, id, String(d.get('photoId')), String(d.get('direction'))),
    'Порядок фотографий обновлён',
  ),
};
