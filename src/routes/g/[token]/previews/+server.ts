import { json } from '@sveltejs/kit';
import { publicPhotoPage } from '#lib/server/galleries/index.ts';

export const GET: import('./$types').RequestHandler = async ({ params, url }) =>
  json(await publicPhotoPage(params.token, url.searchParams));
