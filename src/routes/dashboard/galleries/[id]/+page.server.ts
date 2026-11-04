import { fail, isHttpError, redirect } from '@sveltejs/kit';
import { requireUser } from '#lib/server/auth/index.ts';
import * as galleries from '#lib/server/galleries/index.ts';
import { usage } from '#lib/server/photos/index.ts';
export const load = async ({ locals, params, url }: import('./$types').PageServerLoadEvent) => {
  const user = requireUser(locals),
    gallery = galleries.owned(user.id, params.id, false, true);
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
  };
};
type Event = import('./$types').RequestEvent;
function action(
  operation: (userId: string, id: string, data: FormData) => unknown,
  message: string,
) {
  return async ({ locals, params, request }: Event) => {
    const user = requireUser(locals),
      data = await request.formData();
    try {
      operation(user.id, params.id, data);
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
  delete: async ({ locals, params, request }: Event) => {
    const user = requireUser(locals);
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
