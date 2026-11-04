import { GetObjectCommand } from '@aws-sdk/client-s3';
import { error } from '@sveltejs/kit';
import { ZipArchive } from 'archiver';
import { PassThrough, Readable, Transform } from 'node:stream';
import { limit } from '../config.ts';
import { owned, publicGallery, readyPhotos } from '../galleries/index.ts';
import { bucket, s3, safeFilename } from '../storage/index.ts';
import { acquireArchive } from './active.ts';

type Photo = ReturnType<typeof readyPhotos>[number];

export function archiveNames(photos: Pick<Photo, 'filename'>[]) {
  const used = new Set<string>();
  return photos.map(({ filename }) => {
    const name = safeFilename(filename).replace(/[. ]+$/, '') || 'photo';
    const dot = name.lastIndexOf('.');
    const base = dot > 0 ? name.slice(0, dot) : name;
    const extension = dot > 0 ? name.slice(dot) : '';
    let result = name;
    let suffix = 1;
    while (used.has(result.toLocaleLowerCase('en-US')))
      result = `${base} (${++suffix})${extension}`;
    used.add(result.toLocaleLowerCase('en-US'));
    return result;
  });
}

export async function archive(
  access: { token: string } | { userId: string; id: string },
  signal: AbortSignal,
) {
  const gallery = 'token' in access ? publicGallery(access.token) : owned(access.userId, access.id);
  const photos = readyPhotos(gallery.id);
  if (!photos.length) error(409, 'В галерее нет готовых фотографий');
  if (
    photos.length > limit('ZIP_MAX_PHOTOS', 5000) ||
    photos.reduce((n, p) => n + p.size, 0) > limit('ZIP_MAX_BYTES', 5368709120)
  )
    error(413, 'Галерея превышает лимит размера архива');
  const release = acquireArchive(gallery.id, limit('ZIP_MAX_CONCURRENT', 3));
  if (!release) error(429, 'Слишком много скачиваний. Попробуйте позже');
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), limit('ZIP_TIMEOUT_MS', 1800000));
  timer.unref();
  const onAbort = () => abort.abort();
  signal.addEventListener('abort', onAbort, { once: true });
  if (signal.aborted) abort.abort();
  let source: Readable | undefined;
  let output: PassThrough | undefined;
  let checked: Transform | undefined;
  let cleaned = false;
  let zip: ZipArchive | undefined;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    clearTimeout(timer);
    signal.removeEventListener('abort', onAbort);
    abort.signal.removeEventListener('abort', stop);
    abort.abort();
    source?.destroy();
    checked?.destroy();
    zip?.abort();
    zip?.destroy();
    release();
  };
  const stop = () => output?.destroy(new Error('Скачивание прервано'));
  abort.signal.addEventListener('abort', stop, { once: true });
  async function getPhoto(photo: Photo) {
    const object = await s3().send(
      new GetObjectCommand({ Bucket: bucket(), Key: photo.originalKey }),
      { abortSignal: abort.signal },
    );
    if (
      abort.signal.aborted ||
      !(object.Body instanceof Readable) ||
      object.ContentLength !== photo.size
    ) {
      if (object.Body instanceof Readable) object.Body.destroy();
      throw new Error('Оригинал недоступен или его размер изменился');
    }
    return object.Body;
  }
  try {
    source = await getPhoto(photos[0]);
    if (abort.signal.aborted) throw new Error('Скачивание прервано');
  } catch {
    cleanup();
    error(503, 'Не удалось получить фотографии из хранилища');
  }
  zip = new ZipArchive({ store: true, forceZip64: true });
  output = new PassThrough();
  const destination = output;
  const archiveStream = zip;
  destination.on('error', () => {});
  destination.once('close', cleanup);
  destination.once('end', cleanup);
  archiveStream.on('error', (e) => destination.destroy(e));
  archiveStream.on('warning', (e) => destination.destroy(e));
  archiveStream.pipe(destination);
  const names = archiveNames(photos);
  void (async () => {
    for (let i = 0; i < photos.length; i++) {
      if (abort.signal.aborted) throw new Error('Скачивание прервано');
      if (i) source = await getPhoto(photos[i]);
      const current = source!;
      let bytes = 0;
      checked = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          bytes += chunk.length;
          callback(bytes > photos[i].size ? new Error('Размер оригинала изменился') : null, chunk);
        },
        flush(callback) {
          callback(bytes === photos[i].size ? null : new Error('Неполный оригинал'));
        },
      });
      const verifier = checked;
      current.on('error', (e) => verifier.destroy(e));
      verifier.on('error', (e) => destination.destroy(e));
      const done = new Promise<void>((resolve, reject) => {
        const onEntry = () => {
          destination.off('close', onClose);
          resolve();
        };
        const onClose = () => {
          archiveStream.off('entry', onEntry);
          reject(new Error('Скачивание прервано'));
        };
        archiveStream.once('entry', onEntry);
        destination.once('close', onClose);
      });
      archiveStream.append(current.pipe(verifier), { name: names[i] });
      await done;
      source = undefined;
      checked = undefined;
    }
    await archiveStream.finalize();
  })().catch((e: Error) => destination.destroy(e));
  const filename = encodeURIComponent(`${safeFilename(gallery.title)}.zip`).replace(
    /['()*]/g,
    (c) => '%' + c.charCodeAt(0).toString(16),
  );
  return new Response(Readable.toWeb(destination) as ReadableStream, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="gallery.zip"; filename*=UTF-8''${filename}`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
