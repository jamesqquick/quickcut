ALTER TABLE `videos` ADD `transcript_requested` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE TABLE `transcripts` (
	`id` text PRIMARY KEY NOT NULL,
	`video_id` text NOT NULL,
	`user_id` text NOT NULL,
	`status` text DEFAULT 'requested' NOT NULL,
	`raw_text` text,
	`cleaned_text` text,
	`vtt` text,
	`word_count` integer,
	`audio_download_url` text,
	`workflow_instance_id` text,
	`error_message` text,
	`requested_at` text DEFAULT (datetime('now')) NOT NULL,
	`started_at` text,
	`completed_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`video_id`) REFERENCES `videos`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `transcripts_video_id_unique` ON `transcripts` (`video_id`);
--> statement-breakpoint
CREATE INDEX `transcripts_user_status_idx` ON `transcripts` (`user_id`, `status`);
