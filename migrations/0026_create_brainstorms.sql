CREATE TABLE IF NOT EXISTS `brainstorms` (
  `id` text PRIMARY KEY NOT NULL,
  `space_id` text NOT NULL REFERENCES `spaces`(`id`) ON DELETE CASCADE,
  `author_user_id` text REFERENCES `users`(`id`) ON DELETE SET NULL,
  `author_display_name` text NOT NULL,
  `title` text NOT NULL,
  `notes` text NOT NULL DEFAULT '',
  `status` text NOT NULL DEFAULT 'open',
  `promoted_project_id` text REFERENCES `projects`(`id`) ON DELETE SET NULL,
  `created_at` text NOT NULL DEFAULT (datetime('now')),
  `updated_at` text NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS `brainstorms_space_status_created_idx`
  ON `brainstorms` (`space_id`, `status`, `created_at`);

CREATE TABLE IF NOT EXISTS `brainstorm_reactions` (
  `id` text PRIMARY KEY NOT NULL,
  `brainstorm_id` text NOT NULL REFERENCES `brainstorms`(`id`) ON DELETE CASCADE,
  `reactor_user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `reactor_display_name` text,
  `emoji` text NOT NULL,
  `created_at` text NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS `brainstorm_reactions_unique`
  ON `brainstorm_reactions` (`brainstorm_id`, `reactor_user_id`, `emoji`);

CREATE INDEX IF NOT EXISTS `brainstorm_reactions_brainstorm_idx`
  ON `brainstorm_reactions` (`brainstorm_id`);
