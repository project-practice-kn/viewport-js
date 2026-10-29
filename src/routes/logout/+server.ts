import { redirect } from '@sveltejs/kit';
import { auth, requireUser } from '#lib/server/auth/index.ts';
export const POST: import('./$types').RequestHandler = async ({
  request,
  locals,
  cookies,
  url,
}) => {
  requireUser(locals);
  if (request.headers.get('origin') !== url.origin)
    return new Response('Недопустимый источник', { status: 403 });
  await auth().api.signOut({ headers: request.headers });
  for (const cookie of cookies.getAll())
    if (cookie.name.startsWith('better-auth.')) cookies.delete(cookie.name, { path: '/' });
  redirect(303, '/login');
};
