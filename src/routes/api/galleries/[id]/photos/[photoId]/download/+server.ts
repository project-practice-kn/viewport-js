import { redirect } from '@sveltejs/kit';
import { requireUser } from '#lib/server/auth/index.ts';
import { setting } from '#lib/server/config.ts';
import { downloadOwned } from '#lib/server/galleries/index.ts';

export const GET: import('./$types').RequestHandler = async ({ locals, params }) => {
  const user = requireUser(locals);
  return redirect(302, await downloadOwned(user.id, params.id, params.photoId), {
    external: [new URL(setting('S3_PUBLIC_ENDPOINT', setting('S3_ENDPOINT'))).origin],
  });
};
