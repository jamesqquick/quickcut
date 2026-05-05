-- Targeted approval requests (issue #93). One row per
-- (video, requester, requested_user) tracks lifecycle:
-- pending -> resolved when the requested user approves, or cancelled.

CREATE TABLE IF NOT EXISTS `approval_requests` (
  `id` text PRIMARY KEY NOT NULL,
  `video_id` text NOT NULL REFERENCES `videos`(`id`) ON DELETE CASCADE,
  `space_id` text NOT NULL REFERENCES `spaces`(`id`) ON DELETE CASCADE,
  `requester_user_id` text REFERENCES `users`(`id`) ON DELETE SET NULL,
  `requester_display_name` text NOT NULL,
  `requested_user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `status` text NOT NULL DEFAULT 'pending',
  `created_at` text DEFAULT (datetime('now')) NOT NULL,
  `resolved_at` text
);

-- Partial unique: only one pending row per (video, requested_user);
-- resolved/cancelled rows are preserved for audit.
CREATE UNIQUE INDEX IF NOT EXISTS `approval_requests_video_user_pending_unique`
  ON `approval_requests` (`video_id`, `requested_user_id`)
  WHERE `status` = 'pending';

CREATE INDEX IF NOT EXISTS `approval_requests_requested_user_pending_idx`
  ON `approval_requests` (`requested_user_id`, `status`);

CREATE INDEX IF NOT EXISTS `approval_requests_video_idx`
  ON `approval_requests` (`video_id`);
