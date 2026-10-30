# Проверка checkpoint MVP

Локальная ветка: `checkpoint-mvp`. Основной запуск переведён на Docker Compose: production-приложение Node.js 24 и приватный SeaweedFS mini 4.48, SQLite WAL в отдельном volume. Ранее проверенный запуск на хосте заменён контейнерным; экспорт исходной SQLite и трёх S3-объектов сохранён локально вне Git.

## Автоматические проверки

- `npm ci` — чистая установка закреплённых зависимостей.
- `npm run db:migrate` дважды — повторяемость миграций.
- `npm test` — временная SQLite, WAL/FK, CHECK constraints (в том числе NULL dimensions), owner checks, поля, квота, идемпотентная отмена, lifecycle, обложка, полный reorder, published locks, token checks, безопасные имена. Sharp: JPEG/PNG/WebP, EXIF rotation, прозрачность, удаление метаданных, повреждённые/обрезанные данные, pixel limit, несовпадающий MIME.
- `npm run verify` — Svelte/TypeScript, Prettier и production build.
- `npm run test:smoke` проходит на dev и на production-сборке; при запущенном приложении — реальные HTTP и S3; два аккаунта; неверный пароль; защищённый кабинет; HTML-формы; чужие ресурсы; CORS preflight и anonymous 403; три формата; конкурентный и повторный confirm; повторный PUT не меняет принятый оригинал; два одновременных запроса на последние байты квоты; CSRF; повреждённый файл; зависший processing; отказ DELETE и повтор cleanup; cover/move; public SSR без email; published locks; скачивание с Unicode filename и совпадением SHA-256; unknown/foreign token/photo; unpublish; инвалидирование сессии.

Smoke удаляет только созданные им тестовые записи/объекты. Нужны запущенные сервер, S3 и миграции. Для другого адреса задайте `SMOKE_ORIGIN`, совпадающий с origin сборки.

## Браузер

Использован agent-browser: регистрация, создание галереи, выбор реального файла и загрузка через PhotoUploader, получение готового превью, публикация, открытие публичной галереи. Проверена ширина 390px: нет горизонтального переполнения, изображения загружены. Проверены также desktop и отсутствие ошибок JavaScript. Браузерные артефакты не коммитятся.

## Ограничения проверки

Восстановление после прерывания моделируется сохранённым `processing` и записанными S3-объектами до ready commit; fault injection моделирует отказ S3 DELETE. Это не полноценное тестирование всех возможных моментов SIGKILL/сетевых отказов. Клавиатурная сортировка использует обычные HTML-кнопки; отдельный touch-device не использовался. Offline/отмена/повтор доступны в UI, но полная браузерная матрица с сетевыми обрывами относится к дальнейшей VP-026. Нет подтверждения публичного production HTTPS и удалённого CI. ZIP и удаление готового состава не входят в checkpoint.

Context7 использован для Drizzle transactions/migrations, AWS presigned URLs/CORS и Sharp 0.35.5. Два запроса документации Better Auth завершились транспортной ошибкой Context7; интеграция дополнительно сверена с типами/исходниками установленной 1.7.10 и проверена настоящими cookie sessions. Особенности SvelteKit 3 (hooks, errors, external redirects, paths.origin) сверены с установленным SDK 3.1.0.

## Docker

Сборка выполняет npm ci по lockfile, компиляцию native modules и production build. `.env` и data исключены из build context; runtime работает как node. При старте выполняются миграции и настройка bucket/CORS, затем HTTP-сервер. `/health` проверяет таблицы мигрированной SQLite. Отдельные S3_ENDPOINT и S3_PUBLIC_ENDPOINT проверены unit-тестом, подпись использует публичный host.

Первоначальная загрузка npm-архива Vite внутри сборки завершалась TLS read ETIMEDOUT. В BuildKit перенесён кэш публичных архивов из успешной установки на хосте; целостность повторно проверяется npm ci. Исходные node_modules и секреты в образ не копируются.

Compose app/s3 проверены healthy. Приложение запускается как UID 1000; /app/.env отсутствует. Полный smoke выполнен одноразовым контейнером профиля tools. Прежние аккаунт, сессия и галерея сохранились при переносе; импорт SQLite/S3 сверяет SHA-256 объектов. Браузером проверены настоящая HTML-форма создания, прямой PUT в Docker S3 и публикация. Найдена и исправлена ошибка Referrer-Policy: same-origin сохраняет Origin для HTML POST и исключает referrer на внешних S3-запросах.

Выполнено полное docker compose down без удаления volumes и docker compose up --build -d --wait. После пересоздания совпали единый SHA-256 содержимого users/galleries/photos и байтов всех ready originals/previews; SQLite quick_check = ok. После этого повторён полный Docker smoke. Оба сервиса healthy.
