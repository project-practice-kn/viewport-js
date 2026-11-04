import { archive } from '#lib/server/downloads/index.ts';
export const GET: import('./$types').RequestHandler = ({ params, request }) =>
  archive({ token: params.token }, request.signal);
