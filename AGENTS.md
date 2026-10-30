# Viewport — инструкции для агентов

## Текущее состояние

Реализован локальный checkpoint MVP: SQLite/Drizzle, Better Auth, собственные галереи, приватный S3, загрузка/Sharp, публикация, публичный SSR и оригиналы. ZIP, удаление готового состава и production deployment остаются в backlog. Статусы и ограничения — tasks/README.md и docs/verification.md. Установленный пакет не означает выполненную функцию.

## Перед работой

Прочитай README.md, docs/architecture.md и tasks/README.md. Перед реализацией задачи прочитай её файл и зависимости. Общение, документация и UI — на русском; идентификаторы и код — на английском.

## Если попросили «подними проект»

Основной запуск checkpoint полностью в Docker Compose. Проверь доступ к Docker daemon и свободные порты 5173/8333. Выполни `node scripts/setup-env.mjs`, затем `docker compose up --build -d --wait`. Скрипт сохраняет существующие настройки и генерирует недостающие/примерные auth/S3 секреты без вывода в лог. Если Node на хосте отсутствует, используй базовый контейнер по docs/deployment.md.

Проверь HTTP 200 на http://localhost:5173/login и /health, healthy у app/s3 через docker compose ps. Приложение само выполняет миграции и bucket CORS перед стартом. Остановка: docker compose down, данные в volumes сохраняются. Чужие процессы не завершай. Не запускай второй сервер с той же SQLite.

Для разработки на хосте нужны Node 24, npm ci, .env, миграции и S3; останови Compose app перед запуском dev на 5173. Инструкция: docs/deployment.md.

## Локальное S3

- SeaweedFS mini — сервис `s3` в compose.yaml; bucket создаётся из `S3_BUCKET`, по умолчанию `viewport-local`.
- С хоста: `S3_ENDPOINT=http://localhost:8333`, `S3_REGION=us-east-1`, `S3_FORCE_PATH_STYLE=true`. Из контейнеров S3_ENDPOINT — `http://s3:8333`; S3_PUBLIC_ENDPOINT для подписанных ссылок — `http://localhost:8333`.
- Ключи берутся из `.env`; без них Compose не запускается. Приложение подключено к S3; bucket CORS настраивается командой npm run s3:setup.
- Логи: `docker compose logs s3`; остановка: `docker compose stop s3`. Данные сохраняются в volume `s3-data`; `docker compose down -v` удалит их.
- Полная инструкция: [docs/deployment.md](docs/deployment.md).

## Стек

- Node.js 24, npm, SvelteKit 3, Svelte 5, TypeScript 6, Bulma + scoped CSS.
- Точные совместимые версии закреплены в package.json/package-lock.json.
- Новые API сверяй с Context7; версии и peerDependencies — с npm registry. Не используй force/legacy-peer-deps.
- SvelteKit 3: vite.config.ts, импорты #lib с расширениями, tsconfig от $app/tsconfig. Не копируй конфигурацию Kit 2.
- Целевая архитектура — один модульный монолит, SQLite, приватный S3. Не добавляй Redis, воркеры, брокеры, микросервисы или альтернативный UI framework.

## Правила реализации

- Routes — тонкие load/actions/endpoints; бизнес-логика — src/lib/server; компоненты — src/lib/components.
- Серверные импорты не попадают в клиентский bundle.
- Проверять сессию и владельца в каждом load/action/endpoint, не полагаться только на layout.
- Изменение состава только в draft; публичные запросы проверяют token/published/photo membership.
- Резервирование квот атомарно в SQLite; сетевых операций внутри транзакции нет.
- SQLite+S3 требуют идемпотентности, компенсаций и повторяемой очистки.
- S3 приватный; ключи генерирует сервер; фактические файлы валидируются, оригиналы не изменяются.
- Секреты, токены, подписанные URL и пользовательские данные не коммитятся и не логируются.
- Не создавать неработающие кнопки и endpoints с фиктивным успешным результатом.

## Проверки

```sh
npm ci
npm run dev
npm run verify
```

verify проверяет типы, форматирование и сборку. npm test проверяет домен/SQLite/Sharp; npm run test:smoke — HTTP и реальный S3. ZIP пока не реализован.

После реализации задачи обновляй её файл, эпик и индекс. Не ставь done по наличию пакета/каталога. Не редактируй lockfile вручную.
