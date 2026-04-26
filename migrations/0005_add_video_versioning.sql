ALTER TABLE `videos` ADD `version_group_id` text;
--> statement-breakpoint
UPDATE `videos` SET `version_group_id` = `id` WHERE `version_group_id` IS NULL;
--> statement-breakpoint
ALTER TABLE `videos` ADD `version_number` integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `videos` ADD `is_current_version` integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
CREATE INDEX `videos_version_group_idx` ON `videos` (`version_group_id`, `version_number`);
--> statement-breakpoint
CREATE INDEX `videos_current_version_idx` ON `videos` (`user_id`, `folder_id`, `is_current_version`);
