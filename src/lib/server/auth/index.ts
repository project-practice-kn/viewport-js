import { betterAuth } from 'better-auth';
import { createAuthMiddleware } from 'better-auth/api';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { redirect } from '@sveltejs/kit';
import { db } from '../db/index.ts';
import * as schema from '../db/schema.ts';
import { origin, setting } from '../config.ts';
import { assertInviteCode } from './invite.ts';
let instance: ReturnType<typeof createAuth> | undefined;
export const auth = () => (instance ??= createAuth());
function createAuth() {
  const secret = setting('BETTER_AUTH_SECRET');
  if (secret.length < 32 || secret.includes('replace-with'))
    throw new Error('Задайте случайный BETTER_AUTH_SECRET длиной от 32 символов');
  return betterAuth({
    baseURL: origin(),
    secret,
    database: drizzleAdapter(db(), { provider: 'sqlite', schema }),
    emailAndPassword: { enabled: true, minPasswordLength: 10, maxPasswordLength: 128 },
    session: { expiresIn: 60 * 60 * 24 * 7, cookieCache: { enabled: false } },
    rateLimit: { enabled: true, window: 60, max: 60 },
    advanced: {
      database: { generateId: 'uuid' },
      ipAddress: { ipAddressHeaders: ['x-viewport-client-ip'] },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path === '/sign-up/email') assertInviteCode(ctx.body?.inviteCode);
      }),
    },
  });
}

// Overwrite the private header for both HTTP auth and HTML forms. Only the adapter resolves IPs.
export async function handleAuthRequest(request: Request, clientAddress: string) {
  const headers = new Headers(request.headers);
  headers.set('x-viewport-client-ip', clientAddress);
  const response = await auth().handler(new Request(request, { headers }));
  if (response.status === 429)
    response.headers.set('Retry-After', response.headers.get('X-Retry-After') || '10');
  return response;
}
export function requireUser(locals: App.Locals) {
  if (!locals.user) redirect(303, '/login');
  return locals.user;
}
