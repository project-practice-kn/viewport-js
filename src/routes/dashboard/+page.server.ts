import { fail, isHttpError, redirect } from '@sveltejs/kit';
import { requireUser } from '#lib/server/auth/index.ts';
import { list, create } from '#lib/server/galleries/index.ts';
import { usage } from '#lib/server/photos/index.ts';
export const load = ({ locals, url }: import('./$types').PageServerLoadEvent) => {
  const user = requireUser(locals, url);
  const query = (url.searchParams.get('q') ?? '').trim().slice(0, 120),
    status = url.searchParams.get('status') ?? '',
    requestedSort = url.searchParams.get('sort') ?? 'date',
    sort = requestedSort === 'name' || requestedSort === 'size' ? requestedSort : 'date';
  return {
    user,
    query,
    status,
    sort,
    galleries: list(user.id, query, status, sort).map((g) => ({
      ...g,
      link: g.status === 'published' ? new URL(`/g/${g.token}`, url.origin).href : null,
      token: undefined,
      coverUrl: g.coverKey && !g.deleting ? `/dashboard/galleries/${g.id}/cover` : null,
      coverKey: undefined,
    })),
    usage: usage(user.id),
  };
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
