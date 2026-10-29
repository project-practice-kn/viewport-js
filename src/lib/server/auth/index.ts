import { betterAuth } from 'better-auth';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { redirect } from '@sveltejs/kit';
import { db } from '../db/index.ts';
import * as schema from '../db/schema.ts';
import { origin, setting } from '../config.ts';
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
    advanced: { database: { generateId: 'uuid' } },
  });
}
export function requireUser(locals: App.Locals) {
  if (!locals.user) redirect(303, '/login');
  return locals.user;
}
