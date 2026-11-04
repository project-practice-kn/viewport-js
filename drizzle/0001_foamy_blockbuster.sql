PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_photos` (
	`id` text PRIMARY KEY NOT NULL,
	`gallery_id` text NOT NULL,
	`filename` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`upload_key` text NOT NULL,
	`original_key` text NOT NULL,
	`preview_key` text,
	`preview_size` integer,
	`width` integer,
	`height` integer,
	`position` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`gallery_id`) REFERENCES `galleries`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "photo_size" CHECK("__new_photos"."size" > 0),
	CONSTRAINT "photo_mime" CHECK("__new_photos"."mime" in ('image/jpeg','image/png','image/webp')),
	CONSTRAINT "photo_state" CHECK("__new_photos"."status" in ('pending','processing','ready','failed')),
	CONSTRAINT "photo_ready" CHECK("__new_photos"."status" != 'ready' or ("__new_photos"."preview_key" is not null and "__new_photos"."width" is not null and "__new_photos"."width" > 0 and "__new_photos"."height" is not null and "__new_photos"."height" > 0 and "__new_photos"."preview_size" is not null and "__new_photos"."preview_size" > 0))
);
--> statement-breakpoint
INSERT INTO `__new_photos`("id", "gallery_id", "filename", "mime", "size", "upload_key", "original_key", "preview_key", "preview_size", "width", "height", "position", "status", "created_at", "updated_at") SELECT "id", "gallery_id", "filename", "mime", "size", "upload_key", "original_key", "preview_key", "preview_size", "width", "height", "position", "status", "created_at", "updated_at" FROM `photos`;--> statement-breakpoint
DROP TABLE `photos`;--> statement-breakpoint
ALTER TABLE `__new_photos` RENAME TO `photos`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `photos_upload_key_unique` ON `photos` (`upload_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `photos_original_key_unique` ON `photos` (`original_key`);--> statement-breakpoint
CREATE INDEX `photos_gallery` ON `photos` (`gallery_id`);--> statement-breakpoint
ALTER TABLE `upload_reservations` ADD `cleaned_at` integer;