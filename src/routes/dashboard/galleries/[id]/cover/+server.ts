import { requireUser } from '#lib/server/auth/index.ts';
import { coverThumbnail } from '#lib/server/galleries/index.ts';

export const GET: import('./$types').RequestHandler = async ({ locals, params, url }) => {
  const signed = await coverThumbnail(requireUser(locals, url).id, params.id);
  return new Response(null, {
    status: 302,
    headers: { Location: signed, 'Cache-Control': 'private, no-store' },
  });
};
