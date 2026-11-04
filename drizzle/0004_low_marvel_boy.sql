CREATE TABLE `deleted_uploads` (
	`upload_key` text PRIMARY KEY NOT NULL,
	`checked_at` integer
);
--> statement-breakpoint
CREATE INDEX `deleted_uploads_checked` ON `deleted_uploads` (`checked_at`);