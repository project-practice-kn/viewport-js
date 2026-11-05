import { requireUser } from '#lib/server/auth/index.ts';
import { owned, photoViews } from '#lib/server/galleries/index.ts';
import { fail, redirect } from '@sveltejs/kit';
export const load: import('./$types').PageServerLoad = async ({ locals, params, url, cookies }) => {
  const gallery = owned(requireUser(locals, url).id, params.id);
  const preference = cookies.get('viewport_preview_theme');
  return {
    title: gallery.title,
    description: gallery.description,
    theme: preference === 'dark' || preference === 'light' ? preference : gallery.theme,
    coverId: gallery.coverId,
    token: gallery.id,
    photos: await photoViews(gallery.id),
    previewsHref: `/dashboard/galleries/${gallery.id}/previews`,
    pageHref: url.pathname,
    downloadBase: `/api/galleries/${gallery.id}/photos`,
    archiveHref: `/api/galleries/${gallery.id}/archive`,
    preview: true,
    editorHref: `/dashboard/galleries/${gallery.id}`,
  };
};
export const actions = {
  theme: async ({ locals, params, request, cookies, url }: import('./$types').RequestEvent) => {
    owned(requireUser(locals, url).id, params.id);
    const theme = (await request.formData()).get('theme');
    if (theme !== 'light' && theme !== 'dark') return fail(400, { message: 'Неизвестная тема' });
    cookies.set('viewport_preview_theme', theme, {
      path: '/dashboard',
      httpOnly: true,
      sameSite: 'lax',
      secure: url.protocol === 'https:',
      maxAge: 31536000,
    });
    redirect(303, url.pathname);
  },
};
