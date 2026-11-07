ALTER TABLE `galleries` ADD `cover_selected` integer DEFAULT false NOT NULL;
--> statement-breakpoint
UPDATE `galleries` SET `cover_selected` = true WHERE `cover_id` IS NOT NULL;
