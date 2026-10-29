import { fail, redirect } from '@sveltejs/kit';
import { auth } from '#lib/server/auth/index.ts';
export const load = ({ locals, url }: import('./$types').PageServerLoadEvent) => {
  if (locals.user) redirect(303, '/dashboard');
  return { register: url.searchParams.get('mode') === 'register' };
};
export const actions = {
  default: async ({ request, cookies }: import('./$types').RequestEvent) => {
    const data = await request.formData();
    const email = String(data.get('email') ?? '').trim(),
      password = String(data.get('password') ?? '');
    const register = data.get('mode') === 'register',
      name = String(data.get('name') ?? '').trim();
    if (register && (!name || name.length > 100))
      return fail(400, { message: 'Укажите имя до 100 символов', email, name, register });
    let response: Response;
    try {
      response = register
        ? await auth().api.signUpEmail({
            body: { email, password, name },
            headers: request.headers,
            asResponse: true,
          })
        : await auth().api.signInEmail({
            body: { email, password },
            headers: request.headers,
            asResponse: true,
          });
    } catch {
      return fail(400, { message: 'Не удалось войти. Проверьте данные', email, name, register });
    }
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
    redirect(303, '/dashboard');
  },
};
