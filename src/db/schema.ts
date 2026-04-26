import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
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

export const videos = sqliteTable("videos", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
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
  streamVideoId: text("stream_video_id"),
  streamPlaybackUrl: text("stream_playback_url"),
  thumbnailUrl: text("thumbnail_url"),
  duration: real("duration"),
  fileName: text("file_name"),
  fileSize: integer("file_size"),
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
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});
