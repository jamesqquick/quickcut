-- Targeted approval requests (issue #93).
--
-- Replaces the previous "fan-out to every space member" model. An owner
-- or uploader can now explicitly request approval from specific space
-- members. Each row is the source of truth for one (video, requester,
-- requestedUser) request and tracks its lifecycle: pending → resolved
-- when the requested user approves the video, or cancelled if the
-- requester withdraws it.
--
-- Notifications and emails are still the delivery mechanism, but they
-- are now per-user and personalized off these rows.

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

-- One pending request per (video, requested_user). Resolved/cancelled
-- rows are kept for audit but don't prevent re-requesting.
CREATE UNIQUE INDEX IF NOT EXISTS `approval_requests_video_user_pending_unique`
  ON `approval_requests` (`video_id`, `requested_user_id`)
  WHERE `status` = 'pending';

CREATE INDEX IF NOT EXISTS `approval_requests_requested_user_pending_idx`
  ON `approval_requests` (`requested_user_id`, `status`);

CREATE INDEX IF NOT EXISTS `approval_requests_video_idx`
  ON `approval_requests` (`video_id`);
