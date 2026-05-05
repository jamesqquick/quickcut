-- Make notifications.comment_id nullable so non-comment notifications
-- (e.g. approval.requested) can be persisted without a backing comment.
-- SQLite cannot drop NOT NULL via ALTER TABLE, so we recreate the table.

PRAGMA foreign_keys=OFF;

CREATE TABLE `__new_notifications` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `actor_user_id` text REFERENCES `users`(`id`) ON DELETE SET NULL,
  `actor_display_name` text NOT NULL,
  `type` text NOT NULL,
  `video_id` text NOT NULL REFERENCES `videos`(`id`) ON DELETE CASCADE,
  `comment_id` text REFERENCES `comments`(`id`) ON DELETE CASCADE,
  `parent_comment_id` text REFERENCES `comments`(`id`) ON DELETE CASCADE,
  `space_id` text NOT NULL REFERENCES `spaces`(`id`) ON DELETE CASCADE,
  `title` text NOT NULL,
  `body` text,
  `href` text NOT NULL,
  `read_at` text,
  `created_at` text DEFAULT (datetime('now')) NOT NULL
);

INSERT INTO `__new_notifications`
SELECT `id`, `user_id`, `actor_user_id`, `actor_display_name`, `type`,
       `video_id`, `comment_id`, `parent_comment_id`, `space_id`,
       `title`, `body`, `href`, `read_at`, `created_at`
FROM `notifications`;

DROP TABLE `notifications`;
ALTER TABLE `__new_notifications` RENAME TO `notifications`;

CREATE INDEX `notifications_user_read_idx` ON `notifications` (`user_id`, `read_at`);
CREATE INDEX `notifications_created_at_idx` ON `notifications` (`created_at`);

PRAGMA foreign_keys=ON;
