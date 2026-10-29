# Viewport — инструкции для агентов

## Текущее состояние

Реализован локальный checkpoint MVP: SQLite/Drizzle, Better Auth, собственные галереи, приватный S3, загрузка/Sharp, публикация, публичный SSR и оригиналы. ZIP, удаление готового состава и production deployment остаются в backlog. Статусы и ограничения — tasks/README.md и docs/verification.md. Установленный пакет не означает выполненную функцию.

## Перед работой

Прочитай README.md, docs/architecture.md и tasks/README.md. Перед реализацией задачи прочитай её файл и зависимости. Общение, документация и UI — на русском; идентификаторы и код — на английском.

## Если попросили «подними проект»

1. Проверь Node.js 24, npm и доступ к Docker Compose. При использовании nvm выполни `nvm install && nvm use`; для сборки нативных npm-пакетов могут понадобиться Python 3, make и C++ compiler.
2. Выполни `npm ci`. Выполни `node scripts/setup-env.mjs` и `npm run db:migrate`. Если `.env` отсутствует, скрипт использует `.env.example`. Недостающие, пустые или примерные `S3_ACCESS_KEY_ID` и `S3_SECRET_ACCESS_KEY` заполни случайными значениями через `node:crypto` без вывода ключей в лог. Остальные существующие настройки сохраняй.
3. Запусти `docker compose up -d --wait s3`, затем `npm run s3:setup` и `npm run dev -- --host 127.0.0.1 --port 5173 --strictPort`. Dev-сервер оставь работающим в фоновой сессии.
4. Проверь HTTP 200 и форму входа на `http://localhost:5173`, а также healthy у `s3` через `docker compose ps`. Сообщи адреса и команды остановки. Если порт занят, проверь существующий процесс; чужие процессы не завершай.

Для запуска приложения необходимы `.env` и миграции. Вместо Docker допустим локальный бинарный SeaweedFS 4.48 по docs/deployment.md. Если отсутствуют системные зависимости или права Docker, укажи конкретную причину; не объявляй полный запуск успешным.

## Локальное S3

- SeaweedFS mini — сервис `s3` в compose.yaml; bucket создаётся из `S3_BUCKET`, по умолчанию `viewport-local`.
- С хоста: `S3_ENDPOINT=http://localhost:8333`, `S3_REGION=us-east-1`, `S3_FORCE_PATH_STYLE=true`. Из контейнеров — `http://s3:8333`; адрес для подписанных ссылок должен быть доступен браузеру.
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
