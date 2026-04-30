CREATE TABLE `comment_reactions` (
  `id` text PRIMARY KEY NOT NULL,
  `comment_id` text NOT NULL,
  `emoji` text NOT NULL,
  `reactor_user_id` text NOT NULL,
  `reactor_display_name` text,
  `created_at` text DEFAULT (datetime('now')) NOT NULL,
  FOREIGN KEY (`comment_id`) REFERENCES `comments`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`reactor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
  CHECK (`emoji` IN ('👍', '👀', '❤️', '😂', '🎉'))
);

CREATE UNIQUE INDEX `comment_reactions_user_unique`
  ON `comment_reactions` (`comment_id`, `emoji`, `reactor_user_id`)
  WHERE `reactor_user_id` IS NOT NULL;
