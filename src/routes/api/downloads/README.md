# Скачивание оригинала

GET `/api/downloads/{token}/{photoId}` вызывает [download](../../../lib/server/galleries/index.ts), проверяющий публикацию, токен, ready и принадлежность фото. Ответ перенаправляет на короткоживущий S3 GET с безопасным Content-Disposition; внешний redirect разрешён только для настроенного публичного S3 origin.
