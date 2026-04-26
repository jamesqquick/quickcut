CREATE TABLE `folders` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`parent_id` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`parent_id`) REFERENCES `folders`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `videos` ADD `folder_id` text REFERENCES folders(id) ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX `folders_user_parent_idx` ON `folders` (`user_id`, `parent_id`);
--> statement-breakpoint
CREATE INDEX `videos_folder_idx` ON `videos` (`folder_id`);
