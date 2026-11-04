import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { and, asc, eq, sql } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { db, atomic } from '../db/index.ts';
import { photos, reservations, galleries, deletedUploads } from '../db/schema.ts';
import { owned } from '../galleries/index.ts';
import { limit } from '../config.ts';
import * as storage from '../storage/index.ts';
sharp.concurrency(1);
sharp.cache(false);
const mimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
export type FileMetadata = { name: string; size: number; type: string };
export function usage(userId: string) {
  const used = db()
    .select({ total: sql<number>`coalesce(sum(${photos.size}),0)` })
    .from(photos)
    .innerJoin(galleries, eq(galleries.id, photos.galleryId))
    .where(and(eq(galleries.userId, userId), eq(photos.status, 'ready')))
    .get()!.total;
  // Pending expired reservations stay charged until cleanup succeeds; failed uploads cannot become ready.
  const reserved = db()
    .select({ total: sql<number>`coalesce(sum(${reservations.size}),0)` })
    .from(reservations)
    .where(and(eq(reservations.userId, userId), eq(reservations.status, 'reserved')))
    .get()!.total;
  return { used, reserved, quota: limit('USER_STORAGE_QUOTA_BYTES', 5368709120) };
}
export function reserve(userId: string, galleryId: string, files: FileMetadata[]) {
  if (
    !Array.isArray(files) ||
    !files.length ||
    files.length > Math.min(limit('MAX_UPLOAD_BATCH_FILES', 20), 100)
  )
    error(400, 'Выберите от 1 до 20 файлов за раз');
  for (const f of files) {
    if (
      !f ||
      typeof f.name !== 'string' ||
      !f.name.trim() ||
      f.name.length > 255 ||
      !mimeTypes.includes(f.type) ||
      !Number.isSafeInteger(f.size) ||
      f.size <= 0 ||
      f.size > limit('MAX_FILE_SIZE_BYTES', 10485760)
    )
      error(400, 'Допустимы JPEG, PNG и WebP до 10 МиБ с непустым именем');
  }
  return atomic(() => {
    owned(userId, galleryId, true);
    const { used, reserved, quota } = usage(userId);
    if (used + reserved + files.reduce((sum, f) => sum + f.size, 0) > quota)
      error(409, 'Недостаточно места в хранилище');
    const count = db()
      .select({ total: sql<number>`count(*)` })
      .from(reservations)
      .where(and(eq(reservations.userId, userId), eq(reservations.status, 'reserved')))
      .get()!.total;
    if (count + files.length > 100)
      error(429, 'Слишком много незавершённых загрузок. Повторите после очистки');
    const now = new Date(),
      expiresAt = new Date(
        now.getTime() + Math.min(limit('UPLOAD_RESERVATION_TTL_SECONDS', 1800), 3600) * 1000,
      );
    return files.map((f) => {
      const id = randomUUID(),
        prefix = `users/${userId}/galleries/${galleryId}`;
      const photo = {
        id,
        galleryId,
        filename: storage.safeFilename(f.name),
        mime: f.type,
        size: f.size,
        uploadKey: `${prefix}/uploads/${id}`,
        originalKey: `${prefix}/originals/${id}`,
        createdAt: now,
        updatedAt: now,
      };
      db().insert(photos).values(photo).run();
      db()
        .insert(reservations)
        .values({ id: randomUUID(), photoId: id, userId, size: f.size, expiresAt, createdAt: now })
        .run();
      return { ...photo, expiresAt };
    });
  });
}
function getPhoto(userId: string, photoId: string) {
  const photo = db().select().from(photos).where(eq(photos.id, photoId)).get();
  if (!photo) error(404, 'Фотография не найдена');
  owned(userId, photo.galleryId);
  const reservation = db()
    .select()
    .from(reservations)
    .where(and(eq(reservations.photoId, photoId), eq(reservations.userId, userId)))
    .get();
  if (!reservation) error(404, 'Фотография не найдена');
  return { photo, reservation };
}
export async function presign(userId: string, galleryId: string, files: FileMetadata[]) {
  await cleanup(10);
  const batch = reserve(userId, galleryId, files);
  try {
    return await Promise.all(
      batch.map(async (p) => ({
        id: p.id,
        url: await storage.presignPut(
          p.uploadKey,
          p.mime,
          p.size,
          Math.min(300, Math.floor((p.expiresAt.getTime() - Date.now()) / 1000)),
        ),
        requiredHeaders: { 'Content-Type': p.mime },
        expiresAt: p.expiresAt.toISOString(),
      })),
    );
  } catch {
    batch.forEach((p) => failPhoto(p.id));
    error(503, 'Не удалось подготовить загрузку. Повторите запрос');
  }
}
function failPhoto(id: string) {
  atomic(() => {
    db()
      .update(photos)
      .set({ status: 'failed', updatedAt: new Date() })
      .where(and(eq(photos.id, id), sql`${photos.status} != 'ready'`))
      .run();
    db()
      .update(reservations)
      .set({ status: 'released', cleanedAt: null })
      .where(and(eq(reservations.photoId, id), eq(reservations.status, 'reserved')))
      .run();
    // Failed uploads cannot confirm again. Keep all keys until the temporary PUT expires for durable cleanup.
  });
}
export async function createPreview(original: Buffer, expectedMime: string) {
  const image = sharp(original, {
    limitInputPixels: limit('MAX_IMAGE_PIXELS', 40000000),
    failOn: 'warning',
    animated: false,
  });
  const metadata = await image.metadata();
  const mime = (
    { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' } as Record<string, string>
  )[metadata.format ?? ''];
  if (!mime || mime !== expectedMime || (metadata.pages ?? 1) > 1)
    throw new Error('Формат изображения не поддерживается или не совпадает');
  return image
    .autoOrient()
    .resize({ width: 1800, height: 1800, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer({ resolveWithObject: true });
}

let processing = 0;
const active = new Set<string>();

// Called inside the deletion transaction after owner verification. An in-process
// confirm retains its lease even after expiry until its finalizer has run.
export function recoverExpiredProcessing(galleryId: string) {
  const expired = db()
    .select({ id: photos.id })
    .from(photos)
    .innerJoin(reservations, eq(reservations.photoId, photos.id))
    .where(
      and(
        eq(photos.galleryId, galleryId),
        eq(photos.status, 'processing'),
        sql`${reservations.expiresAt} <= ${Date.now()}`,
      ),
    )
    .all();
  for (const { id } of expired) {
    if (!active.has(id))
      db()
        .update(photos)
        .set({ status: 'failed', updatedAt: new Date() })
        .where(eq(photos.id, id))
        .run();
  }
}

// A PUT already in progress may recreate an object after any successful DELETE.
// Keep tombstones indefinitely and rotate the oldest attempt to avoid starvation.
export async function cleanupDeletedUploads(batchSize = 25) {
  const candidates = db()
    .select()
    .from(deletedUploads)
    .orderBy(asc(deletedUploads.checkedAt), asc(deletedUploads.uploadKey))
    .limit(batchSize)
    .all();
  let cleaned = 0;
  for (const { uploadKey } of candidates) {
    try {
      await storage.remove(uploadKey);
      cleaned++;
    } catch {
      // Retry on a future cycle; failure must not lose the key.
    } finally {
      db()
        .update(deletedUploads)
        .set({ checkedAt: new Date() })
        .where(eq(deletedUploads.uploadKey, uploadKey))
        .run();
    }
  }
  return cleaned;
}
export async function confirm(userId: string, photoId: string) {
  const { photo, reservation } = getPhoto(userId, photoId);
  owned(userId, photo.galleryId, true);
  if (photo.status === 'ready') return { id: photo.id, status: 'ready' };
  if (processing >= limit('PROCESSING_CONCURRENCY', 2))
    error(429, 'Обработка занята. Повторите подтверждение');
  atomic(() => {
    const current = getPhoto(userId, photoId);
    owned(userId, photo.galleryId, true);
    if (current.photo.status === 'processing') error(409, 'Фотография уже обрабатывается');
    if (
      current.photo.status !== 'pending' ||
      current.reservation.status !== 'reserved' ||
      current.reservation.expiresAt.getTime() <= Date.now()
    )
      error(410, 'Загрузка завершена или срок истёк. Загрузите файл повторно');
    db()
      .update(photos)
      .set({ status: 'processing', updatedAt: new Date() })
      .where(eq(photos.id, photoId))
      .run();
  });
  processing++;
  active.add(photoId);
  const previewKey = photo.originalKey.replace('/originals/', '/previews/') + '.webp';
  try {
    const info = await storage.head(photo.uploadKey);
    if (info.ContentLength !== photo.size) throw new Error('Размер оригинала не совпадает');
    const original = await storage.read(photo.uploadKey, photo.size);
    const { data, info: preview } = await createPreview(original, photo.mime);
    const mime = photo.mime;
    // Only the server can write accepted originals; a repeated temporary PUT cannot overwrite them.
    await storage.put(photo.originalKey, original, mime);
    await storage.put(previewKey, data, 'image/webp');
    atomic(() => {
      owned(userId, photo.galleryId, true);
      const current = getPhoto(userId, photoId);
      if (
        current.photo.status !== 'processing' ||
        current.reservation.status !== 'reserved' ||
        reservation.expiresAt.getTime() <= Date.now()
      )
        error(410, 'Срок загрузки истёк');
      const position = db()
        .select({ value: sql<number>`coalesce(max(${photos.position}),-1)+1` })
        .from(photos)
        .where(eq(photos.galleryId, photo.galleryId))
        .get()!.value;
      db()
        .update(photos)
        .set({
          status: 'ready',
          previewKey,
          previewSize: data.length,
          width: preview.width,
          height: preview.height,
          position,
          updatedAt: new Date(),
        })
        .where(eq(photos.id, photoId))
        .run();
      db()
        .update(reservations)
        .set({ status: 'completed' })
        .where(eq(reservations.photoId, photoId))
        .run();
      db()
        .update(galleries)
        .set({ coverId: photoId })
        .where(and(eq(galleries.id, photo.galleryId), sql`${galleries.coverId} is null`))
        .run();
    });
    // Temporary object remains tracked for deletion after the PUT URL expires.
    return { id: photo.id, status: 'ready' };
  } catch {
    failPhoto(photoId);
    error(422, 'Не удалось проверить изображение. Проверьте формат и повторите загрузку');
  } finally {
    processing--;
    active.delete(photoId);
  }
}
export function cancel(userId: string, photoId: string) {
  atomic(() => {
    const { photo } = getPhoto(userId, photoId);
    owned(userId, photo.galleryId, true);
    if (photo.status === 'ready' || photo.status === 'processing')
      error(409, 'Загрузка уже подтверждается или завершена');
    failPhoto(photoId);
  });
}
export async function cleanup(batchSize = 25) {
  await cleanupDeletedUploads(batchSize);
  const candidates = db()
    .select({ photo: photos, reservation: reservations })
    .from(photos)
    .innerJoin(reservations, eq(photos.id, reservations.photoId))
    .where(sql`${reservations.expiresAt} <= ${Date.now()} and ${reservations.cleanedAt} is null`)
    .limit(batchSize)
    .all();
  let cleaned = 0;
  for (const { photo, reservation } of candidates) {
    if (active.has(photo.id)) continue;
    // Claim in a short transaction; a live confirm will fail its final CAS if its lease expired.
    const discard = atomic(() => {
      const current = db().select().from(photos).where(eq(photos.id, photo.id)).get();
      if (!current) return null;
      if (current.status === 'ready') return false;
      db()
        .update(photos)
        .set({ status: 'failed', updatedAt: new Date() })
        .where(eq(photos.id, photo.id))
        .run();
      return true;
    });
    if (discard === null) continue;
    try {
      await storage.remove(photo.uploadKey);
      if (discard) {
        await storage.remove(photo.originalKey);
        await storage.remove(photo.originalKey.replace('/originals/', '/previews/') + '.webp');
      }
      atomic(() => {
        if (reservation.status === 'reserved')
          db()
            .update(reservations)
            .set({ status: 'expired' })
            .where(eq(reservations.id, reservation.id))
            .run();
        // Keep the reservation history; mark completed cleanup separately.
        db()
          .update(reservations)
          .set({ cleanedAt: new Date() })
          .where(eq(reservations.id, reservation.id))
          .run();
      });
      cleaned++;
    } catch {
      /* Durable keys remain available for retry, with reservation charged. */
    }
  }
  return cleaned;
}
