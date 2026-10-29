import { publicGallery, photoViews } from '#lib/server/galleries/index.ts';
export const load = async ({ params }: import('./$types').PageServerLoadEvent) => {
  const gallery = publicGallery(params.token);
  return {
    title: gallery.title,
    description: gallery.description,
    theme: gallery.theme,
    coverId: gallery.coverId,
    token: params.token,
    photos: await photoViews(gallery.id),
  };
};
