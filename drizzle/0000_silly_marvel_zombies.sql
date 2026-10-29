CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `accounts_user` ON `accounts` (`user_id`);--> statement-breakpoint
CREATE TABLE `galleries` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`theme` text DEFAULT 'light' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`token` text,
	`cover_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "gallery_title" CHECK(length(trim("galleries"."title")) between 1 and 120),
	CONSTRAINT "gallery_description" CHECK(length("galleries"."description") <= 2000),
	CONSTRAINT "gallery_theme" CHECK("galleries"."theme" in ('light','dark')),
	CONSTRAINT "gallery_state" CHECK("galleries"."status" in ('draft','published') and ("galleries"."status" != 'published' or ("galleries"."token" is not null and "galleries"."cover_id" is not null)))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `galleries_token_unique` ON `galleries` (`token`);--> statement-breakpoint
CREATE INDEX `galleries_owner` ON `galleries` (`user_id`);--> statement-breakpoint
CREATE TABLE `photos` (
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
	CONSTRAINT "photo_size" CHECK("photos"."size" > 0),
	CONSTRAINT "photo_mime" CHECK("photos"."mime" in ('image/jpeg','image/png','image/webp')),
	CONSTRAINT "photo_state" CHECK("photos"."status" in ('pending','processing','ready','failed')),
	CONSTRAINT "photo_ready" CHECK("photos"."status" != 'ready' or ("photos"."preview_key" is not null and "photos"."width" > 0 and "photos"."height" > 0 and "photos"."preview_size" > 0))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `photos_upload_key_unique` ON `photos` (`upload_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `photos_original_key_unique` ON `photos` (`original_key`);--> statement-breakpoint
CREATE INDEX `photos_gallery` ON `photos` (`gallery_id`);--> statement-breakpoint
CREATE TABLE `upload_reservations` (
	`id` text PRIMARY KEY NOT NULL,
	`photo_id` text NOT NULL,
	`user_id` text NOT NULL,
	`size` integer NOT NULL,
	`status` text DEFAULT 'reserved' NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`photo_id`) REFERENCES `photos`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "reservation_size" CHECK("upload_reservations"."size" > 0),
	CONSTRAINT "reservation_state" CHECK("upload_reservations"."status" in ('reserved','completed','released','expired'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `upload_reservations_photo_id_unique` ON `upload_reservations` (`photo_id`);--> statement-breakpoint
CREATE INDEX `reservations_owner_expiry` ON `upload_reservations` (`user_id`,`status`,`expires_at`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_unique` ON `sessions` (`token`);--> statement-breakpoint
CREATE INDEX `sessions_user` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `verifications` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
