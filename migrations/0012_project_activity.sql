-- Track workflow history for video projects.
CREATE TABLE project_activity (
  id TEXT PRIMARY KEY NOT NULL,
  video_id TEXT NOT NULL,
  actor_user_id TEXT,
  actor_display_name TEXT NOT NULL,
  type TEXT NOT NULL,
  data TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE,
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_project_activity_video_id ON project_activity(video_id);
CREATE INDEX idx_project_activity_created_at ON project_activity(created_at);
