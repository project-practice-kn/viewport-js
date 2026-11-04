import { requireUser } from '#lib/server/auth/index.ts';
import { archive } from '#lib/server/downloads/index.ts';
export const GET: import('./$types').RequestHandler = ({ locals, params, request }) =>
  archive({ userId: requireUser(locals).id, id: params.id }, request.signal);
