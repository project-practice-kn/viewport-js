import {
  publicGallery,
  photoViews,
  photoSummary,
  coverView,
  PHOTO_PAGE_SIZE,
} from '#lib/server/galleries/index.ts';
import { fail, redirect } from '@sveltejs/kit';
export const load = async ({ params, cookies, url }: import('./$types').PageServerLoadEvent) => {
  const gallery = publicGallery(params.token);
  const requestedPage = Number(url.searchParams.get('page') ?? '1');
  const page =
    Number.isSafeInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, 100000) : 1;
  const offset = (page - 1) * PHOTO_PAGE_SIZE;
  const preference = cookies.get('viewport_gallery_theme');
  const summary = photoSummary(gallery.id);
  return {
    title: gallery.title,
    description: gallery.description,
    theme: preference === 'light' || preference === 'dark' ? preference : gallery.theme,
    coverId: gallery.coverId,
    cover: await coverView(gallery.id, gallery.coverId),
    token: params.token,
    total: summary.count,
    totalBytes: summary.bytes,
    offset,
    photos: await photoViews(gallery.id, offset),
    previewsHref: `/g/${params.token}/previews`,
    pageHref: `/g/${params.token}`,
    downloadBase: `/api/downloads/${params.token}`,
    archiveHref: `/api/downloads/${params.token}/archive`,
  };
};
export const actions = {
  theme: async ({ params, cookies, request, url }: import('./$types').RequestEvent) => {
    publicGallery(params.token);
    const theme = (await request.formData()).get('theme');
    if (theme !== 'light' && theme !== 'dark') return fail(400, { message: 'Неизвестная тема' });
    cookies.set('viewport_gallery_theme', theme, {
      path: '/g',
      httpOnly: true,
      sameSite: 'lax',
      secure: url.protocol === 'https:',
      maxAge: 365 * 24 * 60 * 60,
    });
    redirect(303, url.pathname + url.search);
  },
};
