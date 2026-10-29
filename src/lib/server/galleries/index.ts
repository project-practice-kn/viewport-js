import { randomUUID, randomBytes } from 'node:crypto';
import { and, eq, asc, desc } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { db, atomic } from '../db/index.ts';
import { galleries, photos, reservations } from '../db/schema.ts';
import { presignGet } from '../storage/index.ts';
export function owned(userId: string, id: string, draft = false) {
  const gallery = db()
    .select()
    .from(galleries)
    .where(and(eq(galleries.id, id), eq(galleries.userId, userId)))
    .get();
  if (!gallery) error(404, 'Галерея не найдена');
  if (draft && gallery.status !== 'draft') error(409, 'Сначала снимите галерею с публикации');
  return gallery;
}
export const list = (userId: string) =>
  db()
    .select({
      id: galleries.id,
      title: galleries.title,
      status: galleries.status,
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
