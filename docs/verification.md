# Проверка шаблона

Проверяется только каркас проекта:

- npm run check — Svelte/TypeScript.
- npm run format:check — Prettier.
- npm run build — сборка adapter-node.
- npm run dev — минимальная страница Viewport.

Общая команда: npm run verify.

Авторизация, SQLite, миграции, S3, обработка изображений и ZIP не реализованы и не проверяются. Папка tests/ зарезервирована под будущие задачи. CI настроен на проверки шаблона; удалённый workflow ещё не запускался.
