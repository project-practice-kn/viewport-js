import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer, index, check } from 'drizzle-orm/sqlite-core';
const date = (name: string) => integer(name, { mode: 'timestamp_ms' }).notNull();
export const user = sqliteTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
  image: text('image'),
  createdAt: date('created_at'),
  updatedAt: date('updated_at'),
});
export const session = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    token: text('token').notNull().unique(),
    expiresAt: date('expires_at'),
    createdAt: date('created_at'),
    updatedAt: date('updated_at'),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (t) => [index('sessions_user').on(t.userId)],
);
export const account = sqliteTable(
  'accounts',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp_ms' }),
    refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp_ms' }),
    scope: text('scope'),
    password: text('password'),
    createdAt: date('created_at'),
    updatedAt: date('updated_at'),
  },
  (t) => [index('accounts_user').on(t.userId)],
);
export const verification = sqliteTable('verifications', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: date('expires_at'),
  createdAt: date('created_at'),
  updatedAt: date('updated_at'),
});
export const galleries = sqliteTable(
  'galleries',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    theme: text('theme', { enum: ['light', 'dark'] })
      .notNull()
      .default('light'),
    status: text('status', { enum: ['draft', 'published'] })
      .notNull()
      .default('draft'),
    token: text('token').unique(),
    coverId: text('cover_id'),
    createdAt: date('created_at'),
    updatedAt: date('updated_at'),
  },
  (t) => [
    index('galleries_owner').on(t.userId),
    check('gallery_title', sql`length(trim(${t.title})) between 1 and 120`),
    check('gallery_description', sql`length(${t.description}) <= 2000`),
    check('gallery_theme', sql`${t.theme} in ('light','dark')`),
    check(
      'gallery_state',
      sql`${t.status} in ('draft','published') and (${t.status} != 'published' or (${t.token} is not null and ${t.coverId} is not null))`,
    ),
  ],
);
export const photos = sqliteTable(
  'photos',
  {
    id: text('id').primaryKey(),
    galleryId: text('gallery_id')
      .notNull()
      .references(() => galleries.id),
    filename: text('filename').notNull(),
    mime: text('mime').notNull(),
    size: integer('size').notNull(),
    uploadKey: text('upload_key').notNull().unique(),
    originalKey: text('original_key').notNull().unique(),
    previewKey: text('preview_key'),
    previewSize: integer('preview_size'),
    width: integer('width'),
    height: integer('height'),
    position: integer('position').notNull().default(0),
    status: text('status', { enum: ['pending', 'processing', 'ready', 'failed'] })
      .notNull()
      .default('pending'),
    createdAt: date('created_at'),
    updatedAt: date('updated_at'),
  },
  (t) => [
    index('photos_gallery').on(t.galleryId),
    check('photo_size', sql`${t.size} > 0`),
    check(
      'photo_metadata',
      sql`(${t.previewSize} is null or ${t.previewSize} > 0) and (${t.width} is null or ${t.width} > 0) and (${t.height} is null or ${t.height} > 0) and ${t.position} >= 0`,
    ),
    check('photo_mime', sql`${t.mime} in ('image/jpeg','image/png','image/webp')`),
    check('photo_state', sql`${t.status} in ('pending','processing','ready','failed')`),
    check(
      'photo_ready',
      sql`${t.status} != 'ready' or (${t.previewKey} is not null and ${t.width} is not null and ${t.width} > 0 and ${t.height} is not null and ${t.height} > 0 and ${t.previewSize} is not null and ${t.previewSize} > 0)`,
    ),
  ],
);
export const reservations = sqliteTable(
  'upload_reservations',
  {
    id: text('id').primaryKey(),
    photoId: text('photo_id')
      .notNull()
      .unique()
      .references(() => photos.id),
    userId: text('user_id')
      .notNull()
      .references(() => user.id),
    size: integer('size').notNull(),
    status: text('status', { enum: ['reserved', 'completed', 'released', 'expired'] })
      .notNull()
      .default('reserved'),
    expiresAt: date('expires_at'),
    createdAt: date('created_at'),
    cleanedAt: integer('cleaned_at', { mode: 'timestamp_ms' }),
  },
  (t) => [
    index('reservations_owner_expiry').on(t.userId, t.status, t.expiresAt),
    check('reservation_size', sql`${t.size} > 0`),
    check('reservation_state', sql`${t.status} in ('reserved','completed','released','expired')`),
  ],
);
