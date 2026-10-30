import { redirect } from '@sveltejs/kit';
import { setting } from '#lib/server/config.ts';
import { download } from '#lib/server/galleries/index.ts';
export const GET: import('./$types').RequestHandler = async ({ params }) =>
  redirect(302, await download(params.token, params.photoId), {
    external: [new URL(setting('S3_PUBLIC_ENDPOINT', setting('S3_ENDPOINT'))).origin],
  });
