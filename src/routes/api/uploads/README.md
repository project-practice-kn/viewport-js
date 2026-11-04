# API загрузки

POST `/api/uploads/presign` принимает galleryId и метаданные files; `/confirm` и `/cancel` — photoId. Маршрут проверяет сессию, JSON и вызывает [сервис фотографий](../../../lib/server/photos/index.ts). Сервис проверяет владельца, draft, TTL и квоту. Cookie-запросы дополнительно защищены проверкой Origin в hook.
