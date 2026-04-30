CREATE TABLE `comment_reactions` (
  `id` text PRIMARY KEY NOT NULL,
  `comment_id` text NOT NULL,
  `emoji` text NOT NULL,
  `reactor_type` text NOT NULL,
  `reactor_user_id` text,
  `anonymous_reactor_id` text,
  `reactor_display_name` text,
  `created_at` text DEFAULT (datetime('now')) NOT NULL,
  FOREIGN KEY (`comment_id`) REFERENCES `comments`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`reactor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
  CHECK (`emoji` IN ('👍', '👀', '❤️', '😂', '🎉')),
  CHECK (`reactor_type` IN ('user', 'anonymous')),
  CHECK (
    (`reactor_type` = 'user' AND `reactor_user_id` IS NOT NULL AND `anonymous_reactor_id` IS NULL)
    OR (`reactor_type` = 'anonymous' AND `anonymous_reactor_id` IS NOT NULL AND `reactor_user_id` IS NULL)
  )
);

CREATE UNIQUE INDEX `comment_reactions_user_unique`
  ON `comment_reactions` (`comment_id`, `emoji`, `reactor_user_id`)
  WHERE `reactor_user_id` IS NOT NULL;

CREATE UNIQUE INDEX `comment_reactions_anonymous_unique`
  ON `comment_reactions` (`comment_id`, `emoji`, `anonymous_reactor_id`)
  WHERE `anonymous_reactor_id` IS NOT NULL;
