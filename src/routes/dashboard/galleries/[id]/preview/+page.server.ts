import { requireUser } from '#lib/server/auth/index.ts';
import {
  owned,
  photoViews,
  photoSummary,
  coverView,
  PHOTO_PAGE_SIZE,
} from '#lib/server/galleries/index.ts';
import { fail, redirect } from '@sveltejs/kit';
export const load: import('./$types').PageServerLoad = async ({ locals, params, url, cookies }) => {
  const gallery = owned(requireUser(locals, url).id, params.id);
  const requestedPage = Number(url.searchParams.get('page') ?? '1');
  const page =
    Number.isSafeInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, 100000) : 1;
  const offset = (page - 1) * PHOTO_PAGE_SIZE;
  const preference = cookies.get('viewport_preview_theme');
  const summary = photoSummary(gallery.id);
  return {
    title: gallery.title,
    description: gallery.description,
    theme: preference === 'dark' || preference === 'light' ? preference : gallery.theme,
    coverId: gallery.coverId,
    cover: await coverView(gallery.id, gallery.coverId),
    token: gallery.id,
    total: summary.count,
    totalBytes: summary.bytes,
    offset,
    photos: await photoViews(gallery.id, offset),
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
    redirect(303, url.pathname + url.search);
  },
};
