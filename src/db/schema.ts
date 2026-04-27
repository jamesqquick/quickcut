import { sqliteTable, text, integer, real, type AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const folders = sqliteTable("folders", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  parentId: text("parent_id").references((): AnySQLiteColumn => folders.id, {
    onDelete: "cascade",
  }),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const videos = sqliteTable("videos", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  folderId: text("folder_id").references(() => folders.id, {
    onDelete: "set null",
  }),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status", { enum: ["processing", "ready", "failed"] })
    .notNull()
    .default("processing"),
  reviewStatus: text("review_status", {
    enum: ["no_status", "needs_review", "in_progress", "approved"],
  })
    .notNull()
    .default("no_status"),
  versionGroupId: text("version_group_id"),
  versionNumber: integer("version_number").notNull().default(1),
  isCurrentVersion: integer("is_current_version", { mode: "boolean" })
    .notNull()
    .default(true),
  streamVideoId: text("stream_video_id"),
  streamPlaybackUrl: text("stream_playback_url"),
  thumbnailUrl: text("thumbnail_url"),
  duration: real("duration"),
  fileName: text("file_name"),
  fileSize: integer("file_size"),
  transcriptRequested: integer("transcript_requested", { mode: "boolean" })
    .notNull()
    .default(false),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const transcripts = sqliteTable("transcripts", {
  id: text("id").primaryKey(),
  videoId: text("video_id")
    .notNull()
    .unique()
    .references(() => videos.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  status: text("status", {
    enum: [
      "not_requested",
      "requested",
      "queued",
      "exporting_audio",
      "waiting_for_audio",
      "transcribing",
      "cleaning",
      "ready",
      "ready_raw_only",
      "failed",
      "skipped_feature_disabled",
    ],
  })
    .notNull()
    .default("requested"),
  rawText: text("raw_text"),
  cleanedText: text("cleaned_text"),
  vtt: text("vtt"),
  wordCount: integer("word_count"),
  audioDownloadUrl: text("audio_download_url"),
  workflowInstanceId: text("workflow_instance_id"),
  errorMessage: text("error_message"),
  requestedAt: text("requested_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  startedAt: text("started_at"),
  completedAt: text("completed_at"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const shareLinks = sqliteTable("share_links", {
  id: text("id").primaryKey(),
  videoId: text("video_id")
    .notNull()
    .references(() => videos.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  status: text("status", { enum: ["active", "revoked"] })
    .notNull()
    .default("active"),
  viewCount: integer("view_count").notNull().default(0),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const comments = sqliteTable("comments", {
  id: text("id").primaryKey(),
  videoId: text("video_id")
    .notNull()
    .references(() => videos.id, { onDelete: "cascade" }),
  authorType: text("author_type", { enum: ["user", "anonymous"] }).notNull(),
  authorUserId: text("author_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  authorDisplayName: text("author_display_name"),
  timestamp: real("timestamp"),
  text: text("text").notNull(),
  parentId: text("parent_id"),
  isResolved: integer("is_resolved", { mode: "boolean" })
    .notNull()
    .default(false),
  resolvedBy: text("resolved_by").references(() => users.id, {
    onDelete: "set null",
  }),
  resolvedAt: text("resolved_at"),
  annotation: text("annotation"),
  urgency: text("urgency", {
    enum: ["idea", "suggestion", "important", "critical"],
  })
    .notNull()
    .default("suggestion"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});
