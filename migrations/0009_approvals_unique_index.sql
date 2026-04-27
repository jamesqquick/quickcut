-- Enforce the design-doc rule that a user can approve any given video at
-- most once. The approvals table was created in 0008 without this index;
-- catching the duplicate at the DB level guards against any race in the
-- API layer between the existence check and the insert.

CREATE UNIQUE INDEX IF NOT EXISTS approvals_video_user_unique
  ON approvals (video_id, user_id);
