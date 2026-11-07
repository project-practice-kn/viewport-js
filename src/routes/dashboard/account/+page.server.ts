import { fail } from '@sveltejs/kit';
import { requireUser, handleAuthRequest } from '#lib/server/auth/index.ts';
import { origin } from '#lib/server/config.ts';
export const load: import('./$types').PageServerLoad = ({ locals, url }) => ({
  user: requireUser(locals, url),
});
export const actions = {
  default: async ({ locals, request, url, getClientAddress }: import('./$types').RequestEvent) => {
    requireUser(locals, url);
    const data = await request.formData();
    if (data.get('newPassword') !== data.get('confirmPassword'))
      return fail(400, { message: 'Пароли не совпадают', success: false });
    const headers = new Headers(request.headers);
    headers.set('Content-Type', 'application/json');
    headers.delete('Content-Length');
    headers.delete('Transfer-Encoding');
    const response = await handleAuthRequest(
      new Request(new URL('/api/auth/change-password', origin()), {
        method: 'POST',
        headers,
        body: JSON.stringify({
          currentPassword: data.get('currentPassword'),
          newPassword: data.get('newPassword'),
          revokeOtherSessions: false,
        }),
      }),
      getClientAddress(),
    );
    if (!response.ok)
      return fail(response.status, {
        message:
          response.status === 429
            ? 'Слишком много попыток. Повторите позже.'
            : 'Проверьте текущий пароль и длину нового пароля (10–128 символов).',
        success: false,
      });
    return { message: 'Пароль изменён', success: true };
  },
};
