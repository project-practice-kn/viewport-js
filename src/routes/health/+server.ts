import { json } from '@sveltejs/kit';
import { db } from '#lib/server/db/index.ts';
export const GET: import('./$types').RequestHandler = () => {
  try {
    db().$client.prepare('SELECT 1 FROM users LIMIT 1').get();
    db().$client.prepare('SELECT 1 FROM photos LIMIT 1').get();
    db().$client.prepare('SELECT cleaned_at FROM upload_reservations LIMIT 1').get();
    return json({ status: 'ok' });
  } catch {
    return json({ status: 'unavailable' }, { status: 503 });
  }
};
