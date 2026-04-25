CREATE INDEX idx_sessions_user ON sessions(user_id);
--> statement-breakpoint
CREATE INDEX idx_sessions_expires ON sessions(expires_at);
--> statement-breakpoint
CREATE INDEX idx_videos_user ON videos(user_id);
--> statement-breakpoint
CREATE INDEX idx_videos_user_created ON videos(user_id, created_at);
--> statement-breakpoint
CREATE INDEX idx_share_links_token ON share_links(token);
--> statement-breakpoint
CREATE INDEX idx_share_links_video ON share_links(video_id);
--> statement-breakpoint
CREATE INDEX idx_comments_video ON comments(video_id);
--> statement-breakpoint
CREATE INDEX idx_comments_video_created ON comments(video_id, created_at);
--> statement-breakpoint
CREATE INDEX idx_comments_parent ON comments(parent_id);
