import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { openDatabase } from '../src/lib/server/db/index.ts';
const database = openDatabase();
// SQLite ignores foreign_keys changes inside a transaction. Disable it before the
// migrator's transaction so generated table rebuilds preserve child references.
database.$client.pragma('foreign_keys = OFF');
try {
  migrate(database, { migrationsFolder: './drizzle' });
  const violations = database.$client.pragma('foreign_key_check');
  if (!Array.isArray(violations) || violations.length)
    throw new Error('Нарушены внешние ключи после миграции');
} finally {
  database.$client.pragma('foreign_keys = ON');
  database.$client.close();
}
console.log('Миграции применены.');
