import { requireUser } from '#lib/server/auth/index.ts';
import { archiveResponse } from '#lib/server/downloads/response.ts';
export const GET: import('./$types').RequestHandler = ({ locals, params, request }) =>
  archiveResponse({ userId: requireUser(locals).id, id: params.id }, request);
