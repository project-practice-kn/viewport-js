import { fail, isHttpError, redirect } from '@sveltejs/kit';
import { requireUser } from '#lib/server/auth/index.ts';
import { list, create } from '#lib/server/galleries/index.ts';
import { usage } from '#lib/server/photos/index.ts';
export const load = ({ locals }: import('./$types').PageServerLoadEvent) => {
  const user = requireUser(locals);
  return { user, galleries: list(user.id), usage: usage(user.id) };
};
export const actions = {
  default: async ({ locals, request }: import('./$types').RequestEvent) => {
    const user = requireUser(locals),
      data = await request.formData();
    let id: string;
    try {
      id = create(user.id, data);
    } catch (e) {
      if (isHttpError(e))
        return fail(e.status, { message: e.body.message, title: String(data.get('title') ?? '') });
      throw e;
    }
    redirect(303, `/dashboard/galleries/${id}`);
  },
};
