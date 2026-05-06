-- Issue #23: per-version "What changed?" notes. Stored on the video row
-- because each version is its own video, so notes are inherently
-- version-specific. Nullable; only meaningful for version 2+ uploads.

ALTER TABLE `videos` ADD `version_notes` text;
