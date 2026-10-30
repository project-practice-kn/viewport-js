# S3

`index.ts` предоставляет ленивый клиент для put/head/read/delete и отдельный клиент для подписи URL. Серверные операции используют S3_ENDPOINT, подпись — S3_PUBLIC_ENDPOINT с fallback на S3_ENDPOINT. Ключи генерируют серверные сервисы, имена скачивания очищаются через safeFilename.
