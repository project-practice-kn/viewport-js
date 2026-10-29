import { fail, isHttpError } from '@sveltejs/kit';
import { requireUser } from '#lib/server/auth/index.ts';
import * as galleries from '#lib/server/galleries/index.ts';
import { usage } from '#lib/server/photos/index.ts';
export const load = async ({ locals, params }: import('./$types').PageServerLoadEvent) => {
  const user = requireUser(locals),
    gallery = galleries.owned(user.id, params.id);
  return {
    gallery: {
      id: gallery.id,
      title: gallery.title,
      description: gallery.description,
      theme: gallery.theme,
      status: gallery.status,
      coverId: gallery.coverId,
      link: gallery.status === 'published' ? `/g/${gallery.token}` : null,
    },
    photos: await galleries.photoViews(gallery.id),
    usage: usage(user.id),
  };
};
type Event = import('./$types').RequestEvent;
function action(operation: (userId: string, id: string, data: FormData) => unknown) {
  return async ({ locals, params, request }: Event) => {
    const user = requireUser(locals),
      data = await request.formData();
    try {
      operation(user.id, params.id, data);
      return { message: 'Сохранено', success: true };
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
  save: action(galleries.edit),
  publish: action(galleries.publish),
  unpublish: action(galleries.unpublish),
  cover: action((u, id, d) => galleries.cover(u, id, String(d.get('photoId')))),
  move: action((u, id, d) =>
    galleries.move(u, id, String(d.get('photoId')), String(d.get('direction'))),
  ),
};
