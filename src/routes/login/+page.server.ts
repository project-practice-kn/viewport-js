import { fail, redirect } from '@sveltejs/kit';
import { handleAuthRequest } from '#lib/server/auth/index.ts';
import { origin } from '#lib/server/config.ts';
import { safeReturnTo } from '#lib/authReturn.ts';
export const load = ({ locals, url }: import('./$types').PageServerLoadEvent) => {
  const returnTo = safeReturnTo(url.searchParams.get('returnTo'));
  if (locals.user) redirect(303, returnTo);
  return {
    register: url.searchParams.get('mode') === 'register',
    returnTo,
    reset: url.searchParams.get('reset') === 'success',
  };
};
export const actions = {
  default: async ({
    request,
    cookies,
    getClientAddress,
    setHeaders,
  }: import('./$types').RequestEvent) => {
    const data = await request.formData();
    const email = String(data.get('email') ?? '').trim(),
      password = String(data.get('password') ?? '');
    const register = data.get('mode') === 'register',
      name = String(data.get('name') ?? '').trim();
    if (register && (!name || name.length > 100))
      return fail(400, { message: 'Укажите имя до 100 символов', email, name, register });
    let response: Response;
    try {
      const headers = new Headers(request.headers);
      headers.set('Content-Type', 'application/json');
      headers.delete('Content-Length');
      headers.delete('Transfer-Encoding');
      response = await handleAuthRequest(
        new Request(
          new URL(register ? '/api/auth/sign-up/email' : '/api/auth/sign-in/email', origin()),
          {
            method: 'POST',
            headers,
            body: JSON.stringify(
              register
                ? { email, password, name, inviteCode: data.get('inviteCode') }
                : { email, password },
            ),
          },
        ),
        getClientAddress(),
      );
    } catch {
      return fail(400, { message: 'Не удалось войти. Проверьте данные', email, name, register });
    }
    if (response.status === 429) {
      const retryAfter = response.headers.get('retry-after') || '10';
      setHeaders({ 'Retry-After': retryAfter });
      return fail(429, {
        message: `Слишком много попыток. Повторите через ${retryAfter} с.`,
        email,
        name,
        register,
      });
    }
    if (register && [403, 503].includes(response.status))
      return fail(response.status, {
        message:
          response.status === 403
            ? 'Неверный код приглашения'
            : 'Регистрация по приглашениям временно недоступна',
        email,
        name,
        register,
      });
    if (!response.ok)
      return fail(400, {
        message: register
          ? 'Не удалось создать аккаунт. Проверьте email и пароль (10–128 символов)'
          : 'Неверный email или пароль',
        email,
        name,
        register,
      });
    // Forward Better Auth cookies without exposing session data to the page.
    for (const header of response.headers.getSetCookie()) {
      const { parseSetCookieHeader } = await import('better-auth/cookies');
      for (const [key, value] of parseSetCookieHeader(header))
        cookies.set(key, value.value, {
          path: '/',
          httpOnly: true,
          sameSite: 'lax',
          secure: new URL(request.url).protocol === 'https:',
          maxAge: value['max-age'] ? Number(value['max-age']) : undefined,
        });
    }
    redirect(303, safeReturnTo(String(data.get('returnTo') ?? '')));
  },
};
