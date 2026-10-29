import type { Handle } from '@sveltejs/kit/hooks';
import { building } from '$app/env';
import { auth } from '#lib/server/auth/index.ts';
export const handle: Handle = async ({ event, resolve }) => {
  event.locals.user = null;
  if (!building) {
    if (event.url.pathname.startsWith('/api/auth/')) return auth().handler(event.request);
    const session = await auth().api.getSession({ headers: event.request.headers });
    if (session) event.locals.user = { id: session.user.id, name: session.user.name };
    if (
      event.url.pathname.startsWith('/api/uploads') &&
      event.request.method === 'POST' &&
      event.request.headers.get('origin') !== event.url.origin
    ) {
      return new Response('Недопустимый источник запроса', { status: 403 });
    }
  }
  const response = await resolve(event);
  response.headers.set('Cache-Control', 'private, no-store');
  response.headers.set('Referrer-Policy', 'no-referrer');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  return response;
};

export const handleError: import('@sveltejs/kit/hooks').HandleServerError = ({ kind }) =>
  kind === 'unknown' ? { message: 'Внутренняя ошибка сервера' } : undefined;
