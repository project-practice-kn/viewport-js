import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { setting } from '../config.ts';
function createClient(endpoint: string) {
  return new S3Client({
    region: setting('S3_REGION', 'us-east-1'),
    endpoint,
    forcePathStyle: setting('S3_FORCE_PATH_STYLE', 'true') === 'true',
    credentials: {
      accessKeyId: setting('S3_ACCESS_KEY_ID'),
      secretAccessKey: setting('S3_SECRET_ACCESS_KEY'),
    },
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
}
let client: S3Client | undefined;
let signingClient: S3Client | undefined;
export const s3 = () => (client ??= createClient(setting('S3_ENDPOINT')));
const signer = () =>
  (signingClient ??= createClient(setting('S3_PUBLIC_ENDPOINT', setting('S3_ENDPOINT'))));
export const bucket = () => setting('S3_BUCKET', 'viewport-local');
export const put = (key: string, body: Uint8Array, mime: string) =>
  s3().send(new PutObjectCommand({ Bucket: bucket(), Key: key, Body: body, ContentType: mime }));
export const head = (key: string) =>
  s3().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
export const remove = (key: string) =>
  s3().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
export async function read(key: string, expectedSize: number) {
  const result = await s3().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
  if (!result.Body || result.ContentLength !== expectedSize)
    throw new Error('Размер оригинала изменился');
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of result.Body as AsyncIterable<Uint8Array>) {
    size += chunk.length;
    if (size > expectedSize) throw new Error('Слишком большой оригинал');
    chunks.push(chunk);
  }
  if (size !== expectedSize) throw new Error('Неполный оригинал');
  return Buffer.concat(chunks);
}
export const presignPut = (key: string, mime: string, ttl: number) =>
  getSignedUrl(signer(), new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: mime }), {
    expiresIn: ttl,
  });
export function safeFilename(name: string) {
  return (
    name
      .replace(/[\\/\x00-\x1f\x7f"<>:|?*]/g, '_')
      .replace(/^\.+/, '')
      .slice(0, 180) || 'photo'
  );
}
export const presignGet = (key: string, filename?: string) =>
  getSignedUrl(
    signer(),
    new GetObjectCommand({
      Bucket: bucket(),
      Key: key,
      ResponseContentDisposition: filename
        ? `attachment; filename="photo"; filename*=UTF-8''${encodeURIComponent(safeFilename(filename)).replace(/['()*]/g, (c) => '%' + c.charCodeAt(0).toString(16))}`
        : undefined,
    }),
    { expiresIn: 120 },
  );
