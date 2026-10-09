-- Remove the scripts feature entirely.
-- Drops the scripts table, cleans up orphaned script-phase comments
-- and script notification rows, and migrates any projects stuck in
-- script phases to "reviewing_video".

DROP TABLE IF EXISTS scripts;

DELETE FROM comments WHERE comment_phase = 'script';

DELETE FROM notifications
 WHERE type IN ('script_comment.created', 'script_comment.reply');

UPDATE projects
   SET phase = 'reviewing_video'
 WHERE phase IN ('creating_script', 'reviewing_script');
