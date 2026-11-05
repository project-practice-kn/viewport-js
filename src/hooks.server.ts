import type { Handle } from '@sveltejs/kit/hooks';
import { building } from '$app/env';
import { auth, handleAuthRequest } from '#lib/server/auth/index.ts';
export const handle: Handle = async ({ event, resolve }) => {
  event.locals.user = null;
  if (!building) {
    if (event.url.pathname === '/api/auth/request-password-reset')
      return securityHeaders(new Response('Восстановление выполняет организатор', { status: 503 }));
    if (event.url.pathname.startsWith('/api/auth/'))
      return securityHeaders(await handleAuthRequest(event.request, event.getClientAddress()));
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
  return securityHeaders(await resolve(event));
};

function securityHeaders(response: Response) {
  response.headers.set('Cache-Control', 'private, no-store');
  response.headers.set('Referrer-Policy', 'same-origin');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  return response;
}

export const handleError: import('@sveltejs/kit/hooks').HandleServerError = ({ kind }) =>
  kind === 'unknown' ? { message: 'Внутренняя ошибка сервера' } : undefined;
