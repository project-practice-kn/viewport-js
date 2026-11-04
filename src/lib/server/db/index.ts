import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import * as schema from './schema.ts';
import { setting } from '../config.ts';
export function openDatabase(path = setting('DATABASE_PATH', './data/viewport.db')) {
  mkdirSync(dirname(path), { recursive: true });
  const sqlite = new Database(path);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  return drizzle(sqlite, { schema });
}
let connection: ReturnType<typeof openDatabase> | undefined;
export const db = () => (connection ??= openDatabase());
export function atomic<T>(operation: () => T): T {
  return db().$client.transaction(operation).immediate();
}
