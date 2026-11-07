import { json } from '@sveltejs/kit';
import { requireUser } from '#lib/server/auth/index.ts';
import { ownedPhotoPage } from '#lib/server/galleries/index.ts';
export const GET: import('./$types').RequestHandler = async ({ locals, params, url }) => {
  const user = requireUser(locals, url);
  return json(await ownedPhotoPage(user.id, params.id, url.searchParams));
};
