# Локальный запуск checkpoint в Docker

## Первый запуск

Создайте `.env` со случайными секретами, затем поднимите весь проект:

```sh
node scripts/setup-env.mjs
docker compose up --build -d --wait
```

Без установленного Node.js первую команду можно выполнить контейнером:

```sh
docker run --rm --user "$(id -u):$(id -g)" -v "$PWD:/workspace" -w /workspace node:24-bookworm-slim node scripts/setup-env.mjs
```

Приложение: **http://localhost:5173**. S3: `http://localhost:8333`, bucket приватный. Порты опубликованы только на loopback. Секреты передаются при запуске через `.env`, исключённый из build context; в образ они не копируются. Не публикуйте вывод `docker compose config`/`inspect` с environment.

Приложение ждёт healthy S3, выполняет миграции и настройку bucket/CORS, затем запускает production-сборку. Ошибка подготовки останавливает запуск. `/health` проверяет доступность таблиц мигрированной SQLite; Compose проверяет его раз в пять секунд. Runtime работает пользователем node, не root.

`ORIGIN` по умолчанию `http://localhost:5173` передаётся в build и runtime. После изменения origin пересоберите образ. Не открывайте приложение по другому hostname: CSRF и Better Auth используют канонический origin.

## Адреса S3

Внутри Compose `S3_ENDPOINT=http://s3:8333` используется для HEAD/GET/PUT/DELETE и настройки bucket. `S3_PUBLIC_ENDPOINT=http://localhost:8333` используется отдельным клиентом только для подписи браузерных ссылок. Оба клиента используют одинаковые bucket/region/credentials; подписанный URL не переписывается после подписи. Это позволяет браузеру обращаться к S3 без знания внутреннего Docker DNS.

CORS разрешает только `ORIGIN`, методы PUT/GET/HEAD и Content-Type, открывает ETag. Anonymous GET возвращает 403. GET TTL — 120 секунд, PUT — до 300 секунд.

## Данные, обновление и остановка

SQLite находится в volume `app-data` по пути `/app/data/viewport.db`; SeaweedFS — в `s3-data`. При первоначальном переносе старые данные из `data/viewport.db` и бинарного S3 сохранены в `data/checkpoint-transfer`, импортированы в volumes и проверены по хэшам. Исходные файлы не удаляются.

```sh
docker compose ps
docker compose logs --tail=50 app
docker compose logs --tail=50 s3
docker compose restart
docker compose up --build -d --wait
docker compose down
```

`down` удаляет контейнеры и сеть, сохраняя volumes. `down -v` удаляет данные. Не запускайте несколько экземпляров приложения с одной SQLite.

Для очистки зависших загрузок после TTL остановите приложение и выполните CLI в одноразовом контейнере:

```sh
docker compose stop app
docker compose run --rm --no-deps app node scripts/cleanup.ts
docker compose up -d --wait app
```

Очистка идёт порциями по 100 записей; повторите команду при большом хвосте. Отказ DELETE сохраняет ключи для повтора; приложение также чистит по 10 записей перед presign. Ошибка/отмена переводит photo в failed и освобождает квоту; временные ключи удаляются после TTL старого PUT.

## Проверка

```sh
docker compose --profile tools run --rm smoke
```

Профиль tools запускает smoke из того же образа с доступом к SQLite volume. На Linux используется host network, чтобы проверять те же `localhost` URL, которыми пользуется браузер. На Docker Desktop для этой команды нужно включить host networking. Smoke создаёт отдельные аккаунты и удаляет только собственные записи/объекты. Unit tests, типы и сборка: `npm test` и `npm run verify`.

## Разработка на хосте

Нужен Node.js 24. Если контейнер app запущен, сначала `docker compose stop app`, чтобы освободить порт и исключить несколько процессов. Затем:

```sh
npm ci
npm run db:migrate
npm run s3:setup
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

При этом используется локальный `DATABASE_PATH` из `.env`, а не Docker volume; это независимая БД. S3 может оставаться контейнерным. Для возврата: остановить dev и `docker compose up -d --wait app`.

Локальный Compose реализован для checkpoint. Публичный HTTPS reverse proxy, внешний домен, backup/restore и финальная VP-029 остаются отдельной работой.

## Лимиты

По умолчанию: 25 МиБ на файл, 10 ГиБ оригиналов на пользователя, до 20 файлов в браузерной партии, до 100 незавершённых резервов на пользователя, до 40 млн пикселей, две обработки одновременно. Endpoint партии ограничен `MAX_UPLOAD_BATCH_FILES` (по умолчанию 20, максимум 100). Перегрузка обработки — 429, без фоновой очереди.

PUT URL — до 300 секунд, reservation — 1800 секунд, GET — 120 секунд. Квота учитывает принятые оригиналы и активные резервы; временные файлы и WebP увеличивают реальный расход S3 сверх квоты. Presigned PUT не ограничивает фактический размер при передаче: сервер проверяет HEAD/GET/декодирование до принятия. Неизменяемые принятые оригиналы находятся под другими ключами, не доступными браузерному PUT.
