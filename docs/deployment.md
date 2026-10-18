# Запуск шаблона

## Dev-сервер

```sh
nvm use
npm ci
npm run dev
```

Открыть http://localhost:5173. Не нужны .env, база данных, S3 или Docker.

Зависимости будущего стека уже перечислены в package.json. Если npm компилирует нативный better-sqlite3, для установки нужны Python 3, make и C++ compiler. Само приложение SQLite не открывает и файлы БД не создаёт.

## Проверка сборки

```sh
npm run verify
npm start
```

Собранный шаблон работает на порту 3000 по умолчанию. Для dev используется npm run dev.

## Шаблон контейнера

Dockerfile и compose.yaml — заготовка для будущего deployment. Они запускают только минимальную страницу, без SQLite volume, миграций, авторизации и S3.

```sh
docker compose up --build
```

## Что предстоит

Подключение БД — VP-002, auth — VP-003, S3 — VP-009. Production HTTPS, persistent SQLite, миграции перед стартом и конфигурация secrets — VP-029, backup/restore — VP-031.

В SvelteKit 3 канонический origin настраивается через paths.origin при сборке либо выводится из доверенных proxy headers. Это нужно учесть в задаче deployment; в минимальном dev-шаблоне конфигурации auth/CSRF пока нет.
