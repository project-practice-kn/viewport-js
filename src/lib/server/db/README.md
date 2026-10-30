# SQLite и Drizzle

В `schema.ts` описаны таблицы и ограничения. `index.ts` открывает SQLite лениво с WAL/FK/busy timeout и предоставляет `atomic` для BEGIN IMMEDIATE. Миграции находятся в [drizzle/](../../../../drizzle/) и запускаются через `scripts/migrate.ts` до HTTP-сервера.
