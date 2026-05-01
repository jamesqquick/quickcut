CREATE TABLE `notifications` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `actor_user_id` text REFERENCES `users`(`id`) ON DELETE SET NULL,
  `actor_display_name` text NOT NULL,
  `type` text NOT NULL,
  `video_id` text NOT NULL REFERENCES `videos`(`id`) ON DELETE CASCADE,
  `comment_id` text NOT NULL REFERENCES `comments`(`id`) ON DELETE CASCADE,
  `parent_comment_id` text REFERENCES `comments`(`id`) ON DELETE CASCADE,
  `space_id` text NOT NULL REFERENCES `spaces`(`id`) ON DELETE CASCADE,
  `title` text NOT NULL,
  `body` text,
  `href` text NOT NULL,
  `read_at` text,
  `created_at` text DEFAULT (datetime('now')) NOT NULL
);

CREATE INDEX `notifications_user_read_idx` ON `notifications` (`user_id`, `read_at`);
CREATE INDEX `notifications_created_at_idx` ON `notifications` (`created_at`);
