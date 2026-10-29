# Проверка checkpoint MVP

Локальная ветка: `checkpoint-mvp`. Проверены Node.js 24.14.1, зависимости из lockfile, настоящий приватный SeaweedFS mini 4.48 на loopback и SQLite WAL. Миграции также применены к БД с фотографиями: данные сохранены, foreign_key_check чистый. Docker Compose не запускался успешно: daemon отсутствует, sudo требует пароль. Бинарный S3 использует те же API и версию, что compose.yaml.

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

Восстановление после прерывания моделируется сохранённым `processing` и записанными S3-объектами до ready commit; fault injection моделирует отказ S3 DELETE. Это не полноценное тестирование всех возможных моментов SIGKILL/сетевых отказов. Клавиатурная сортировка использует обычные HTML-кнопки; отдельный touch-device не использовался. Offline/отмена/повтор доступны в UI, но полная браузерная матрица с сетевыми обрывами относится к дальнейшей VP-026. Нет подтверждения production HTTPS, Docker healthy и удалённого CI. ZIP и удаление готового состава не входят в checkpoint.

Context7 использован для Drizzle transactions/migrations, AWS presigned URLs/CORS и Sharp 0.35.5. Два запроса документации Better Auth завершились транспортной ошибкой Context7; интеграция дополнительно сверена с типами/исходниками установленной 1.7.10 и проверена настоящими cookie sessions. Особенности SvelteKit 3 (hooks, errors, external redirects, paths.origin) сверены с установленным SDK 3.1.0.
