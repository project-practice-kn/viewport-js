import { archiveResponse } from '#lib/server/downloads/response.ts';
export const GET: import('./$types').RequestHandler = ({ params, request }) =>
  archiveResponse({ token: params.token }, request);
