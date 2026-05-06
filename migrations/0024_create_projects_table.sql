-- Issue #121, phase 1: introduce a `projects` table that owns project-level
-- fields. `videos` becomes a version row that points at a project via
-- `project_id`. This phase only ADDS the new structure and backfills it from
-- the existing `version_group_id` grouping. Read sites and writes are still
-- on `videos` for now and are migrated in follow-up PRs. The duplicated
-- columns on `videos` are intentionally kept until then so a rollback is
-- possible without data loss.

CREATE TABLE IF NOT EXISTS `projects` (
  `id` text PRIMARY KEY NOT NULL,
  `space_id` text NOT NULL REFERENCES `spaces`(`id`) ON DELETE CASCADE,
  `uploaded_by` text REFERENCES `users`(`id`) ON DELETE SET NULL,
  `folder_id` text REFERENCES `folders`(`id`) ON DELETE SET NULL,
  `title` text NOT NULL,
  `description` text,
  `phase` text DEFAULT 'reviewing_video' NOT NULL,
  `target_date` text,
  `target_audience` text,
  `hook` text,
  `takeaway1` text,
  `takeaway2` text,
  `takeaway3` text,
  `primary_cta` text,
  `outro` text,
  `created_at` text DEFAULT (datetime('now')) NOT NULL,
  `updated_at` text DEFAULT (datetime('now')) NOT NULL
);

CREATE INDEX IF NOT EXISTS `projects_space_id_idx` ON `projects` (`space_id`);
CREATE INDEX IF NOT EXISTS `projects_folder_id_idx` ON `projects` (`folder_id`);

-- Nullable for now. A later phase makes it NOT NULL and drops the
-- duplicated columns on `videos`.
ALTER TABLE `videos` ADD `project_id` text REFERENCES `projects`(`id`) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS `videos_project_id_idx` ON `videos` (`project_id`);

-- Backfill: one project row per distinct version group. The project id is
-- the canonical version's id (preferring is_current_version, then the
-- lowest version_number, then the earliest created_at). Project-level
-- fields are taken from that same canonical row.
INSERT INTO `projects` (
  `id`, `space_id`, `uploaded_by`, `folder_id`, `title`, `description`,
  `phase`, `target_date`, `target_audience`, `hook`, `takeaway1`,
  `takeaway2`, `takeaway3`, `primary_cta`, `outro`,
  `created_at`, `updated_at`
)
SELECT
  v.`id`, v.`space_id`, v.`uploaded_by`, v.`folder_id`, v.`title`, v.`description`,
  v.`phase`, v.`target_date`, v.`target_audience`, v.`hook`, v.`takeaway1`,
  v.`takeaway2`, v.`takeaway3`, v.`primary_cta`, v.`outro`,
  v.`created_at`, v.`updated_at`
FROM `videos` v
WHERE v.`id` = (
  SELECT inner_v.`id`
  FROM `videos` inner_v
  WHERE COALESCE(inner_v.`version_group_id`, inner_v.`id`)
      = COALESCE(v.`version_group_id`, v.`id`)
  ORDER BY inner_v.`is_current_version` DESC,
           inner_v.`version_number` ASC,
           inner_v.`created_at` ASC
  LIMIT 1
);

-- Point every video at its project. Projects were keyed by the canonical
-- version's id, which equals `version_group_id` when set, else the row's
-- own id (for single-version projects).
UPDATE `videos`
SET `project_id` = (
  SELECT p.`id` FROM `projects` p
  WHERE p.`id` IN (
    SELECT inner_v.`id`
    FROM `videos` inner_v
    WHERE COALESCE(inner_v.`version_group_id`, inner_v.`id`)
        = COALESCE(`videos`.`version_group_id`, `videos`.`id`)
    ORDER BY inner_v.`is_current_version` DESC,
             inner_v.`version_number` ASC,
             inner_v.`created_at` ASC
    LIMIT 1
  )
);
