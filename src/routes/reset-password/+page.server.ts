import { fail, redirect } from '@sveltejs/kit';
import { handleAuthRequest } from '#lib/server/auth/index.ts';
import { origin } from '#lib/server/config.ts';
export const load: import('./$types').PageServerLoad = ({ url }) => ({
  token: url.searchParams.get('token') ?? '',
  invalid: url.searchParams.has('error'),
});
export const actions = {
  default: async ({ request, getClientAddress }: import('./$types').RequestEvent) => {
    const data = await request.formData();
    const newPassword = String(data.get('newPassword') ?? '');
    if (newPassword !== data.get('confirmPassword'))
      return fail(400, { message: 'Пароли не совпадают' });
    const headers = new Headers(request.headers);
    headers.set('Content-Type', 'application/json');
    headers.delete('Content-Length');
    headers.delete('Transfer-Encoding');
    const response = await handleAuthRequest(
      new Request(new URL('/api/auth/reset-password', origin()), {
        method: 'POST',
        headers,
        body: JSON.stringify({ newPassword, token: data.get('token') }),
      }),
      getClientAddress(),
    );
    if (!response.ok)
      return fail(response.status, {
        message:
          response.status === 429
            ? 'Слишком много попыток. Повторите позже.'
            : 'Ссылка недействительна или пароль не соответствует требованиям (10–128 символов).',
      });
    redirect(303, '/login?reset=success');
  },
};
