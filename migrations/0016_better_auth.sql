-- Fresh start: drop old auth tables and recreate with Better Auth schema.
-- All existing data will be lost (intended).

-- Drop tables that reference users first (order matters for FK constraints)
DROP TABLE IF EXISTS `comment_reactions`;
DROP TABLE IF EXISTS `approvals`;
DROP TABLE IF EXISTS `comments`;
DROP TABLE IF EXISTS `share_links`;
DROP TABLE IF EXISTS `transcripts`;
DROP TABLE IF EXISTS `scripts`;
DROP TABLE IF EXISTS `project_activity`;
DROP TABLE IF EXISTS `videos`;
DROP TABLE IF EXISTS `space_invites`;
DROP TABLE IF EXISTS `space_members`;
DROP TABLE IF EXISTS `folders`;
DROP TABLE IF EXISTS `spaces`;
DROP TABLE IF EXISTS `sessions`;
DROP TABLE IF EXISTS `users`;

-- Recreate users table (Better Auth schema)
CREATE TABLE `users` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `email` text NOT NULL,
  `email_verified` integer DEFAULT false NOT NULL,
  `image` text,
  `created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  `updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);

-- Recreate sessions table (Better Auth schema)
CREATE TABLE `sessions` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `token` text NOT NULL,
  `expires_at` integer NOT NULL,
  `ip_address` text,
  `user_agent` text,
  `created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  `updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
CREATE UNIQUE INDEX `sessions_token_unique` ON `sessions` (`token`);

-- New: accounts table (Better Auth schema)
CREATE TABLE `accounts` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `account_id` text NOT NULL,
  `provider_id` text NOT NULL,
  `access_token` text,
  `refresh_token` text,
  `access_token_expires_at` integer,
  `refresh_token_expires_at` integer,
  `scope` text,
  `id_token` text,
  `password` text,
  `created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  `updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);

-- New: verifications table (Better Auth schema)
CREATE TABLE `verifications` (
  `id` text PRIMARY KEY NOT NULL,
  `identifier` text NOT NULL,
  `value` text NOT NULL,
  `expires_at` integer NOT NULL,
  `created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  `updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);

-- Recreate all dependent tables (same schema as before)
CREATE TABLE `spaces` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `owner_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `required_approvals` integer DEFAULT 0 NOT NULL,
  `pipeline_enabled` integer DEFAULT false NOT NULL,
  `created_at` text DEFAULT (datetime('now')) NOT NULL,
  `updated_at` text DEFAULT (datetime('now')) NOT NULL
);

CREATE TABLE `space_members` (
  `id` text PRIMARY KEY NOT NULL,
  `space_id` text NOT NULL REFERENCES `spaces`(`id`) ON DELETE CASCADE,
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `role` text DEFAULT 'member' NOT NULL,
  `created_at` text DEFAULT (datetime('now')) NOT NULL
);

CREATE TABLE `space_invites` (
  `id` text PRIMARY KEY NOT NULL,
  `space_id` text NOT NULL REFERENCES `spaces`(`id`) ON DELETE CASCADE,
  `email` text NOT NULL,
  `invited_by` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `token` text NOT NULL,
  `status` text DEFAULT 'pending' NOT NULL,
  `created_at` text DEFAULT (datetime('now')) NOT NULL,
  `accepted_at` text
);
CREATE UNIQUE INDEX `space_invites_token_unique` ON `space_invites` (`token`);

CREATE TABLE `folders` (
  `id` text PRIMARY KEY NOT NULL,
  `space_id` text NOT NULL REFERENCES `spaces`(`id`) ON DELETE CASCADE,
  `name` text NOT NULL,
  `parent_id` text REFERENCES `folders`(`id`) ON DELETE CASCADE,
  `created_at` text DEFAULT (datetime('now')) NOT NULL,
  `updated_at` text DEFAULT (datetime('now')) NOT NULL
);

CREATE TABLE `videos` (
  `id` text PRIMARY KEY NOT NULL,
  `space_id` text NOT NULL REFERENCES `spaces`(`id`) ON DELETE CASCADE,
  `uploaded_by` text REFERENCES `users`(`id`) ON DELETE SET NULL,
  `folder_id` text REFERENCES `folders`(`id`) ON DELETE SET NULL,
  `title` text NOT NULL,
  `description` text,
  `status` text DEFAULT 'processing' NOT NULL,
  `version_group_id` text,
  `version_number` integer DEFAULT 1 NOT NULL,
  `is_current_version` integer DEFAULT true NOT NULL,
  `stream_video_id` text,
  `stream_playback_url` text,
  `thumbnail_url` text,
  `duration` real,
  `file_name` text,
  `file_size` integer,
  `transcript_requested` integer DEFAULT false NOT NULL,
  `phase` text DEFAULT 'reviewing_video' NOT NULL,
  `target_date` text,
  `created_at` text DEFAULT (datetime('now')) NOT NULL,
  `updated_at` text DEFAULT (datetime('now')) NOT NULL
);

CREATE TABLE `scripts` (
  `id` text PRIMARY KEY NOT NULL,
  `video_id` text NOT NULL REFERENCES `videos`(`id`) ON DELETE CASCADE,
  `content` text DEFAULT '' NOT NULL,
  `plain_text` text DEFAULT '' NOT NULL,
  `status` text DEFAULT 'writing' NOT NULL,
  `created_by` text REFERENCES `users`(`id`) ON DELETE SET NULL,
  `created_at` text DEFAULT (datetime('now')) NOT NULL,
  `updated_at` text DEFAULT (datetime('now')) NOT NULL
);
CREATE UNIQUE INDEX `scripts_video_id_unique` ON `scripts` (`video_id`);

CREATE TABLE `project_activity` (
  `id` text PRIMARY KEY NOT NULL,
  `video_id` text NOT NULL REFERENCES `videos`(`id`) ON DELETE CASCADE,
  `actor_user_id` text REFERENCES `users`(`id`) ON DELETE SET NULL,
  `actor_display_name` text NOT NULL,
  `type` text NOT NULL,
  `data` text,
  `created_at` text DEFAULT (datetime('now')) NOT NULL
);

CREATE TABLE `transcripts` (
  `id` text PRIMARY KEY NOT NULL,
  `video_id` text NOT NULL REFERENCES `videos`(`id`) ON DELETE CASCADE,
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
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
  `updated_at` text DEFAULT (datetime('now')) NOT NULL
);
CREATE UNIQUE INDEX `transcripts_video_id_unique` ON `transcripts` (`video_id`);

CREATE TABLE `share_links` (
  `id` text PRIMARY KEY NOT NULL,
  `video_id` text NOT NULL REFERENCES `videos`(`id`) ON DELETE CASCADE,
  `token` text NOT NULL,
  `status` text DEFAULT 'active' NOT NULL,
  `view_count` integer DEFAULT 0 NOT NULL,
  `created_at` text DEFAULT (datetime('now')) NOT NULL
);
CREATE UNIQUE INDEX `share_links_token_unique` ON `share_links` (`token`);

CREATE TABLE `comments` (
  `id` text PRIMARY KEY NOT NULL,
  `video_id` text NOT NULL REFERENCES `videos`(`id`) ON DELETE CASCADE,
  `author_type` text NOT NULL,
  `author_user_id` text REFERENCES `users`(`id`) ON DELETE SET NULL,
  `author_display_name` text,
  `timestamp` real,
  `text` text NOT NULL,
  `parent_id` text,
  `is_resolved` integer DEFAULT false NOT NULL,
  `resolved_by` text REFERENCES `users`(`id`) ON DELETE SET NULL,
  `resolved_at` text,
  `resolved_reason` text,
  `annotation` text,
  `urgency` text DEFAULT 'suggestion' NOT NULL,
  `comment_phase` text DEFAULT 'review' NOT NULL,
  `text_range` text,
  `created_at` text DEFAULT (datetime('now')) NOT NULL
);

CREATE TABLE `approvals` (
  `id` text PRIMARY KEY NOT NULL,
  `video_id` text NOT NULL REFERENCES `videos`(`id`) ON DELETE CASCADE,
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `comment` text,
  `created_at` text DEFAULT (datetime('now')) NOT NULL
);

CREATE TABLE `comment_reactions` (
  `id` text PRIMARY KEY NOT NULL,
  `comment_id` text NOT NULL REFERENCES `comments`(`id`) ON DELETE CASCADE,
  `emoji` text NOT NULL,
  `reactor_user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `reactor_display_name` text,
  `created_at` text DEFAULT (datetime('now')) NOT NULL
);
CREATE UNIQUE INDEX `comment_reactions_user_unique` ON `comment_reactions` (`comment_id`, `emoji`, `reactor_user_id`) WHERE `reactor_user_id` IS NOT NULL;
