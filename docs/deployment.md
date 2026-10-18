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

Dockerfile запускает минимальную страницу. В compose.yaml также есть локальный S3-сервис SeaweedFS mini; SQLite volume, миграции и авторизация пока не подключены.

## Локальное S3-хранилище

Если `.env` ещё нет, скопируйте шаблон:

```sh
cp .env.example .env
```

В `.env` замените `S3_ACCESS_KEY_ID` и `S3_SECRET_ACCESS_KEY` своими локальными значениями. Например, для генерации каждого значения можно использовать `openssl rand -hex 24`. Compose требует оба ключа, чтобы хранилище не запускалось в режиме Allow All.

```sh
docker compose up -d --wait s3
docker compose logs s3
```

SeaweedFS mini 4.48 создаёт bucket из `S3_BUCKET` (по умолчанию `viewport-local`). S3 endpoint для приложения на хосте и браузера — `http://localhost:8333`, регион — `us-east-1`, `S3_FORCE_PATH_STYLE=true`. Из контейнера адрес — `http://s3:8333`; такой внутренний адрес нельзя использовать в подписанных ссылках для браузера.

На хост публикуется только S3-порт, привязанный к `127.0.0.1`. Данные и метаданные сохраняются в volume `s3-data`. Healthcheck проверяет HTTP-ответ S3 gateway. Остановить хранилище без удаления данных:

```sh
docker compose stop s3
```

Приложение пока не использует хранилище. Настройка bucket CORS и проверка подписанных загрузок из браузера относятся к VP-009.

Запуск обоих контейнеров:

```sh
docker compose up --build
```

## Что предстоит

Подключение БД — VP-002, auth — VP-003, S3 — VP-009. Production HTTPS, persistent SQLite, миграции перед стартом и конфигурация secrets — VP-029, backup/restore — VP-031.

В SvelteKit 3 канонический origin настраивается через paths.origin при сборке либо выводится из доверенных proxy headers. Это нужно учесть в задаче deployment; в минимальном dev-шаблоне конфигурации auth/CSRF пока нет.
