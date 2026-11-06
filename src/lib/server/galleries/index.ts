import { randomUUID, randomBytes } from 'node:crypto';
import { and, eq, asc, desc, sql, inArray, like } from 'drizzle-orm';
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
export type GallerySort = 'date' | 'name' | 'size';
const galleryPhotoBytes = sql<number>`(select coalesce(sum(p.size), 0) from photos p where p.gallery_id = galleries.id and p.status = 'ready' and p.deleting = 0)`;
export const list = (userId: string, query = '', status = '', sort: GallerySort = 'date') =>
  db()
    .select({
      id: galleries.id,
      title: galleries.title,
      status: galleries.status,
      deleting: galleries.deleting,
      createdAt: galleries.createdAt,
      updatedAt: galleries.updatedAt,
      token: galleries.token,
      coverKey: sql<
        string | null
      >`(select coalesce(p.thumbnail_key, p.preview_key) from photos p where p.id = ${galleries.coverId} and p.gallery_id = galleries.id and p.status = 'ready' and p.deleting = 0)`,
      photoCount: sql<number>`(select count(*) from photos where photos.gallery_id = galleries.id and photos.status = 'ready' and photos.deleting = 0)`,
      photoBytes: galleryPhotoBytes,
    })
    .from(galleries)
    .where(
      and(
        eq(galleries.userId, userId),
        query ? like(galleries.title, `%${query}%`) : undefined,
        status === 'draft' || status === 'published' ? eq(galleries.status, status) : undefined,
      ),
    )
    .orderBy(
      sort === 'name'
        ? asc(galleries.title)
        : sort === 'size'
          ? desc(galleryPhotoBytes)
          : desc(galleries.updatedAt),
      desc(galleries.createdAt),
      asc(galleries.id),
    )
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
    .where(and(eq(photos.galleryId, id), eq(photos.status, 'ready'), eq(photos.deleting, false)))
    .orderBy(asc(photos.position), asc(photos.createdAt), asc(photos.id))
    .all();
export const PHOTO_PAGE_SIZE = 24;
export function photoSummary(id: string) {
  return db()
    .select({ count: sql<number>`count(*)`, bytes: sql<number>`coalesce(sum(${photos.size}), 0)` })
    .from(photos)
    .where(and(eq(photos.galleryId, id), eq(photos.status, 'ready'), eq(photos.deleting, false)))
    .get()!;
}
export function readyPhotoPage(id: string, offset: number, limit: number) {
  return db()
    .select()
    .from(photos)
    .where(and(eq(photos.galleryId, id), eq(photos.status, 'ready'), eq(photos.deleting, false)))
    .orderBy(asc(photos.position), asc(photos.createdAt), asc(photos.id))
    .limit(limit)
    .offset(offset)
    .all();
}
export async function coverView(id: string, coverId: string | null) {
  if (!coverId) return null;
  const photo = db()
    .select()
    .from(photos)
    .where(
      and(
        eq(photos.id, coverId),
        eq(photos.galleryId, id),
        eq(photos.status, 'ready'),
        eq(photos.deleting, false),
      ),
    )
    .get();
  return photo
    ? {
        id: photo.id,
        filename: photo.filename,
        width: photo.width!,
        height: photo.height!,
        url: await presignGet(photo.previewKey!),
      }
    : null;
}
export async function coverThumbnail(userId: string, id: string) {
  const gallery = owned(userId, id);
  if (!gallery.coverId) error(404, 'Обложка не найдена');
  const photo = db()
    .select()
    .from(photos)
    .where(
      and(
        eq(photos.id, gallery.coverId),
        eq(photos.galleryId, id),
        eq(photos.status, 'ready'),
        eq(photos.deleting, false),
      ),
    )
    .get();
  if (!photo) error(404, 'Обложка не найдена');
  return presignGet(photo.thumbnailKey ?? photo.previewKey!);
}
export async function photoViews(id: string, offset?: number, limit = PHOTO_PAGE_SIZE) {
  return Promise.all(
    (offset === undefined ? readyPhotos(id) : readyPhotoPage(id, offset, limit)).map(async (p) => ({
      id: p.id,
      filename: p.filename,
      width: p.width!,
      height: p.height!,
      size: p.size,
      url: await presignGet(p.previewKey!),
      thumbnailUrl: await presignGet(p.thumbnailKey ?? p.previewKey!),
    })),
  );
}
export function cover(userId: string, id: string, photoId: string) {
  atomic(() => {
    owned(userId, id, true);
    if (!readyPhotos(id).some((p) => p.id === photoId))
      error(400, 'Выберите готовую фотографию этой галереи');
    db()
      .update(galleries)
      .set({ coverId: photoId, coverSelected: true, updatedAt: new Date() })
      .where(eq(galleries.id, id))
      .run();
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
    ids.forEach((photoId, index) =>
      db()
        .update(photos)
        .set({ position: current[index].position })
        .where(eq(photos.id, photoId))
        .run(),
    );
    db().update(galleries).set({ updatedAt: new Date() }).where(eq(galleries.id, id)).run();
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
    if (
      db()
        .select({ id: photos.id })
        .from(photos)
        .where(and(eq(photos.galleryId, id), eq(photos.deleting, true)))
        .get()
    )
      error(409, 'Завершите удаление фотографий перед публикацией');
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

export function rotateLink(userId: string, id: string) {
  return atomic(() => {
    const gallery = owned(userId, id);
    if (gallery.status !== 'published') error(409, 'Сначала опубликуйте галерею');
    const token = randomBytes(32).toString('base64url');
    db().update(galleries).set({ token, updatedAt: new Date() }).where(eq(galleries.id, id)).run();
    return token;
  });
}

export function sortByName(userId: string, id: string) {
  owned(userId, id, true);
  const sorted = readyPhotos(id).sort(
    (a, b) =>
      a.filename.localeCompare(b.filename, 'ru', { numeric: true }) || a.position - b.position,
  );
  reorder(
    userId,
    id,
    sorted.map((p) => p.id),
  );
}

export function moveMany(userId: string, id: string, selected: string[], target: string) {
  atomic(() => {
    owned(userId, id, true);
    const current = readyPhotos(id).map((p) => p.id);
    if (
      !selected.length ||
      new Set(selected).size !== selected.length ||
      selected.some((p) => !current.includes(p))
    )
      error(400, 'Выберите фотографии этой галереи');
    if (!['start', 'end'].includes(target)) error(400, 'Выберите начало или конец галереи');
    const chosen = current.filter((p) => selected.includes(p)),
      rest = current.filter((p) => !selected.includes(p));
    reorder(userId, id, target === 'start' ? [...chosen, ...rest] : [...rest, ...chosen]);
  });
}

export function deletingPhotos(userId: string, id: string) {
  owned(userId, id, false, true);
  return db()
    .select({ id: photos.id, filename: photos.filename, size: photos.size })
    .from(photos)
    .where(and(eq(photos.galleryId, id), eq(photos.deleting, true)))
    .all();
}

export async function removePhotos(userId: string, id: string, ids: string[]) {
  const items = atomic(() => {
    const gallery = owned(userId, id, true);
    if (hasActiveArchive(id)) error(409, 'Дождитесь завершения скачивания архива');
    if (!ids.length || new Set(ids).size !== ids.length) error(400, 'Выберите фотографии');
    const items = db()
      .select()
      .from(photos)
      .where(and(eq(photos.galleryId, id), inArray(photos.id, ids)))
      .all();
    if (items.length !== ids.length || items.some((p) => p.status !== 'ready'))
      error(404, 'Фотографии не найдены');
    db()
      .update(photos)
      .set({ deleting: true, updatedAt: new Date() })
      .where(inArray(photos.id, ids))
      .run();
    if (gallery.coverId && ids.includes(gallery.coverId))
      db()
        .update(galleries)
        .set({
          coverId: readyPhotos(id)[0]?.id ?? null,
          coverSelected: false,
          updatedAt: new Date(),
        })
        .where(eq(galleries.id, id))
        .run();
    return items;
  });
  try {
    for (const photo of items)
      for (const key of new Set(
        [photo.uploadKey, photo.originalKey, photo.previewKey!, photo.thumbnailKey].filter(
          (key): key is string => !!key,
        ),
      ))
        await removeObject(key);
  } catch {
    error(503, 'Не удалось удалить файлы. Повторите удаление фотографий');
  }
  atomic(() => {
    owned(userId, id, true);
    for (const photo of items)
      db()
        .insert(deletedUploads)
        .values({ uploadKey: photo.uploadKey })
        .onConflictDoNothing()
        .run();
    db().delete(reservations).where(inArray(reservations.photoId, ids)).run();
    db()
      .delete(photos)
      .where(and(eq(photos.galleryId, id), inArray(photos.id, ids), eq(photos.deleting, true)))
      .run();
    db().update(galleries).set({ updatedAt: new Date() }).where(eq(galleries.id, id)).run();
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
        photo.thumbnailKey ?? photo.originalKey.replace('/originals/', '/thumbnails/') + '.webp',
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
