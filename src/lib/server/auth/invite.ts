import { createHash, timingSafeEqual } from 'node:crypto';
import { APIError } from 'better-auth/api';

export function assertInviteCode(value: unknown) {
  const expected = process.env.REGISTRATION_INVITE_CODE?.trim();
  if (!expected || /replace-with/i.test(expected))
    throw new APIError('SERVICE_UNAVAILABLE', {
      message: 'Регистрация по приглашениям временно недоступна',
    });
  if (
    typeof value !== 'string' ||
    value.length > 256 ||
    !timingSafeEqual(
      createHash('sha256').update(value.trim()).digest(),
      createHash('sha256').update(expected).digest(),
    )
  )
    throw new APIError('FORBIDDEN', { message: 'Неверный код приглашения' });
}
