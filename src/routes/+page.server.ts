import { redirect } from '@sveltejs/kit';
export const load = ({ locals }: import('./$types').PageServerLoadEvent) =>
  redirect(303, locals.user ? '/dashboard' : '/login');
