import { randomUUID, randomBytes } from 'node:crypto';
import { and, eq, asc, desc } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { db, atomic } from '../db/index.ts';
import { galleries, photos, reservations, deletedUploads } from '../db/schema.ts';
import { presignGet, remove as removeObject } from '../storage/index.ts';
import { recoverExpiredProcessing } from '../photos/index.ts';
import { hasActiveArchive } from '../downloads/active.ts';
export function owned(userId: string, id: string, draft = false, allowDeleting = false) {
  const gallery = db()
    .select()
    .from(galleries)
    .where(and(eq(galleries.id, id), eq(galleries.userId, userId)))
    .get();
  if (!gallery) error(404, 'Галерея не найдена');
  if (gallery.deleting && !allowDeleting)
    error(409, 'Удаление галереи не завершено. Повторите удаление');
  if (draft && gallery.status !== 'draft') error(409, 'Сначала снимите галерею с публикации');
  return gallery;
}
export const list = (userId: string) =>
  db()
    .select({
      id: galleries.id,
      title: galleries.title,
      status: galleries.status,
      deleting: galleries.deleting,
      createdAt: galleries.createdAt,
    })
    .from(galleries)
    .where(eq(galleries.userId, userId))
    .orderBy(desc(galleries.createdAt))
    .all();
function fields(data: FormData) {
  const title = String(data.get('title') ?? '').trim();
  const description = String(data.get('description') ?? '').trim();
  const theme = String(data.get('theme') ?? 'light');
  if (!title || title.length > 120) error(400, 'Название должно содержать от 1 до 120 символов');
  if (description.length > 2000) error(400, 'Описание — до 2000 символов');
  if (theme !== 'light' && theme !== 'dark') error(400, 'Неизвестная тема');
  return { title, description, theme } as {
    title: string;
    description: string;
    theme: 'light' | 'dark';
  };
}
export function create(userId: string, data: FormData) {
  const id = randomUUID();
  db()
    .insert(galleries)
    .values({ id, userId, ...fields(data), createdAt: new Date(), updatedAt: new Date() })
    .run();
  return id;
}
export function edit(userId: string, id: string, data: FormData) {
  const values = fields(data);
  atomic(() => {
    owned(userId, id, true);
    db()
      .update(galleries)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(galleries.id, id))
      .run();
  });
}
export const readyPhotos = (id: string) =>
  db()
    .select()
    .from(photos)
    .where(and(eq(photos.galleryId, id), eq(photos.status, 'ready')))
    .orderBy(asc(photos.position), asc(photos.createdAt), asc(photos.id))
    .all();
export async function photoViews(id: string) {
  return Promise.all(
    readyPhotos(id).map(async (p) => ({
      id: p.id,
      filename: p.filename,
      width: p.width!,
      height: p.height!,
      url: await presignGet(p.previewKey!),
    })),
  );
}
export function cover(userId: string, id: string, photoId: string) {
  atomic(() => {
    owned(userId, id, true);
    if (!readyPhotos(id).some((p) => p.id === photoId))
      error(400, 'Выберите готовую фотографию этой галереи');
    db().update(galleries).set({ coverId: photoId }).where(eq(galleries.id, id)).run();
  });
}
export function reorder(userId: string, id: string, ids: string[]) {
  atomic(() => {
    owned(userId, id, true);
    const current = readyPhotos(id);
    if (
      new Set(ids).size !== ids.length ||
      ids.length !== current.length ||
      current.some((p) => !ids.includes(p.id))
    )
      error(400, 'Передайте все фотографии без повторов');
    ids.forEach((photoId, position) =>
      db().update(photos).set({ position }).where(eq(photos.id, photoId)).run(),
    );
  });
}
export function move(userId: string, id: string, photoId: string, direction: string) {
  atomic(() => {
    owned(userId, id, true);
    const ids = readyPhotos(id).map((p) => p.id);
    const from = ids.indexOf(photoId),
      to = from + (direction === 'up' ? -1 : direction === 'down' ? 1 : 0);
    if (from < 0 || to < 0 || to >= ids.length || from === to)
      error(400, 'Невозможно переместить фотографию');
    [ids[from], ids[to]] = [ids[to], ids[from]];
    reorder(userId, id, ids);
  });
}
export function publish(userId: string, id: string) {
  return atomic(() => {
    const gallery = owned(userId, id);
    if (gallery.status === 'published') return gallery.token;
    const ready = readyPhotos(id);
    const active = db()
      .select({ id: reservations.id })
      .from(reservations)
      .innerJoin(photos, eq(photos.id, reservations.photoId))
      .where(and(eq(photos.galleryId, id), eq(reservations.status, 'reserved')))
      .get();
    if (!ready.length || !ready.some((p) => p.id === gallery.coverId) || active)
      error(409, 'Нужны готовые фотографии, обложка и завершённые загрузки');
    const token = gallery.token ?? randomBytes(32).toString('base64url');
    db()
      .update(galleries)
      .set({ token, status: 'published', updatedAt: new Date() })
      .where(eq(galleries.id, id))
      .run();
    return token;
  });
}
export function unpublish(userId: string, id: string) {
  atomic(() => {
    owned(userId, id);
    db()
      .update(galleries)
      .set({ status: 'draft', updatedAt: new Date() })
      .where(eq(galleries.id, id))
      .run();
  });
}
export function publicGallery(token: string) {
  const gallery = db()
    .select()
    .from(galleries)
    .where(and(eq(galleries.token, token), eq(galleries.status, 'published')))
    .get();
  if (!gallery) error(404, 'Галерея не найдена');
  return gallery;
}
export async function download(token: string, photoId: string) {
  const gallery = publicGallery(token);
  const photo = readyPhotos(gallery.id).find((p) => p.id === photoId);
  if (!photo) error(404, 'Галерея не найдена');
  return presignGet(photo.originalKey, photo.filename);
}
export async function downloadOwned(userId: string, galleryId: string, photoId: string) {
  const gallery = owned(userId, galleryId);
  const photo = readyPhotos(gallery.id).find((p) => p.id === photoId);
  if (!photo) error(404, 'Фотография не найдена');
  return presignGet(photo.originalKey, photo.filename);
}

// Keep the gallery and all object keys until every S3 delete succeeds. The durable
// flag prevents new uploads or publication while the operation is retried.
export async function remove(userId: string, id: string) {
  const items = atomic(() => {
    const gallery = owned(userId, id, false, true);
    if (gallery.status !== 'draft') error(409, 'Сначала снимите галерею с публикации');
    if (hasActiveArchive(id)) error(409, 'Дождитесь завершения скачивания архива');
    recoverExpiredProcessing(id);
    const items = db()
      .select({ photo: photos, reservation: reservations })
      .from(photos)
      .leftJoin(reservations, eq(reservations.photoId, photos.id))
      .where(eq(photos.galleryId, id))
      .all();
    if (items.some(({ photo }) => photo.status === 'processing'))
      error(409, 'Дождитесь завершения обработки фотографий');
    if (items.some(({ reservation }) => !reservation))
      error(409, 'Не найдены сведения о загрузке. Обратитесь к администратору');
    const waitUntil = Math.max(
      0,
      ...items.map(({ reservation }) => reservation!.expiresAt.getTime()),
    );
    if (waitUntil > Date.now())
      error(
        409,
        `Повторите удаление через ${Math.ceil((waitUntil - Date.now()) / 60000)} мин.: ещё действует ссылка загрузки`,
      );
    db()
      .update(galleries)
      .set({ deleting: true, updatedAt: new Date() })
      .where(eq(galleries.id, id))
      .run();
    return items;
  });
  try {
    for (const { photo } of items) {
      for (const key of new Set([
        photo.uploadKey,
        photo.originalKey,
        photo.previewKey ?? photo.originalKey.replace('/originals/', '/previews/') + '.webp',
      ]))
        await removeObject(key);
    }
  } catch {
    error(503, 'Не удалось удалить файлы из хранилища. Повторите удаление галереи');
  }
  atomic(() => {
    const gallery = db()
      .select()
      .from(galleries)
      .where(and(eq(galleries.id, id), eq(galleries.userId, userId)))
      .get();
    if (!gallery) return; // Another identical deletion finished first.
    const ids = db()
      .select({ id: photos.id, uploadKey: photos.uploadKey })
      .from(photos)
      .where(eq(photos.galleryId, id))
      .all();
    for (const photo of ids)
      db()
        .insert(deletedUploads)
        .values({ uploadKey: photo.uploadKey })
        .onConflictDoNothing()
        .run();
    for (const photo of ids)
      db().delete(reservations).where(eq(reservations.photoId, photo.id)).run();
    db().delete(photos).where(eq(photos.galleryId, id)).run();
    db().delete(galleries).where(eq(galleries.id, id)).run();
  });
}
