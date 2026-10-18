# Проверка шаблона

Проверяется только каркас проекта:

- npm run check — Svelte/TypeScript.
- npm run format:check — Prettier.
- npm run build — сборка adapter-node.
- npm run dev — минимальная страница Viewport.

Общая команда: npm run verify.

Авторизация, SQLite, миграции, интеграция приложения с S3, обработка изображений и ZIP не реализованы и не проверяются командой verify. Папка tests/ зарезервирована под будущие задачи. CI настроен на проверки шаблона; удалённый workflow ещё не запускался.

Для проверки запуска новым разработчиком используйте отдельную копию без `node_modules`, `.env`, `.svelte-kit` и `build`: выполните `npm ci`, `npm run verify` и запустите dev-сервер. Главная страница должна вернуть HTTP 200 и текст «Шаблон SvelteKit запущен». Для полного локального окружения подготовьте `.env` и запустите SeaweedFS по [deployment.md](deployment.md); `docker compose ps` должен показать healthy у `s3`. Node.js 24 и доступный Docker устанавливаются на машине отдельно.
