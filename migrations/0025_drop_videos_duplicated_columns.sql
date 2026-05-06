-- Issue #121, phase 3b: drop the duplicated project-level columns from
-- `videos` and the `version_group_id` column. Make `project_id` NOT NULL.
-- After phase 1 created `projects` and backfilled `videos.project_id`,
-- phase 2 migrated every read site to source project-level fields from
-- `projects`, and phase 3a stopped every dual-write to `videos`. Nothing
-- reads or updates the duplicated columns anymore, so they can be removed.

PRAGMA foreign_keys=OFF;

-- Defensive: every existing video row has a project_id from phase 1's
-- backfill. If somehow a row slipped through with a null project_id,
-- reuse the row's id (matches the phase 1 backfill convention for
-- single-version projects). Without this the NOT NULL on the rebuilt
-- table would reject the INSERT.
UPDATE `videos` SET `project_id` = `id` WHERE `project_id` IS NULL;

CREATE TABLE `__new_videos` (
  `id` text PRIMARY KEY NOT NULL,
  `space_id` text NOT NULL REFERENCES `spaces`(`id`) ON DELETE CASCADE,
  `uploaded_by` text REFERENCES `users`(`id`) ON DELETE SET NULL,
  `project_id` text NOT NULL REFERENCES `projects`(`id`) ON DELETE CASCADE,
  `status` text DEFAULT 'processing' NOT NULL,
  `version_number` integer DEFAULT 1 NOT NULL,
  `is_current_version` integer DEFAULT 1 NOT NULL,
  `stream_video_id` text,
  `stream_playback_url` text,
  `thumbnail_url` text,
  `duration` real,
  `file_name` text,
  `file_size` integer,
  `transcript_requested` integer DEFAULT 0 NOT NULL,
  `version_notes` text,
  `created_at` text DEFAULT (datetime('now')) NOT NULL,
  `updated_at` text DEFAULT (datetime('now')) NOT NULL
);

INSERT INTO `__new_videos` (
  `id`, `space_id`, `uploaded_by`, `project_id`, `status`,
  `version_number`, `is_current_version`,
  `stream_video_id`, `stream_playback_url`, `thumbnail_url`,
  `duration`, `file_name`, `file_size`, `transcript_requested`,
  `version_notes`, `created_at`, `updated_at`
)
SELECT
  `id`, `space_id`, `uploaded_by`, `project_id`, `status`,
  `version_number`, `is_current_version`,
  `stream_video_id`, `stream_playback_url`, `thumbnail_url`,
  `duration`, `file_name`, `file_size`, `transcript_requested`,
  `version_notes`, `created_at`, `updated_at`
FROM `videos`;

DROP TABLE `videos`;
ALTER TABLE `__new_videos` RENAME TO `videos`;

CREATE INDEX IF NOT EXISTS `videos_project_id_idx` ON `videos` (`project_id`);
CREATE INDEX IF NOT EXISTS `videos_space_id_idx` ON `videos` (`space_id`);

PRAGMA foreign_keys=ON;
