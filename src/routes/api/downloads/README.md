# Скачивание оригинала

GET `/api/downloads/{token}/{photoId}` вызывает [download](../../../lib/server/galleries/index.ts), проверяющий публикацию, токен, ready и принадлежность фото. Ответ перенаправляет на короткоживущий S3 GET с безопасным Content-Disposition; внешний redirect разрешён только для настроенного публичного S3 origin.

Для владельца GET `/api/galleries/{id}/photos/{photoId}/download` проверяет сессию, владельца, статус ready и принадлежность снимка. Он доступен как в черновике, так и после публикации и выдаёт такой же короткоживущий redirect на оригинал.

GET `/api/downloads/{token}/archive` выдаёт ZIP опубликованной галереи; GET `/api/galleries/{id}/archive` — ZIP владельцу. Оба запроса повторно проверяют доступ; детали ограничений и потоковой передачи — в [архитектуре](../../../docs/architecture.md).
