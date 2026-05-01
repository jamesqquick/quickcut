import { index, sqliteTable, text, integer, real, uniqueIndex, type AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp_ms" }),
  refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp_ms" }),
  scope: text("scope"),
  idToken: text("id_token"),
  password: text("password"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export const verifications = sqliteTable("verifications", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export const folders = sqliteTable("folders", {
  id: text("id").primaryKey(),
  spaceId: text("space_id")
    .notNull()
    .references(() => spaces.id, { onDelete: "cascade" }),
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
  spaceId: text("space_id")
    .notNull()
    .references(() => spaces.id, { onDelete: "cascade" }),
  uploadedBy: text("uploaded_by").references(() => users.id, {
    onDelete: "set null",
  }),
  folderId: text("folder_id").references(() => folders.id, {
    onDelete: "set null",
  }),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status", { enum: ["draft", "processing", "ready", "failed"] })
    .notNull()
    .default("processing"),
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
  phase: text("phase", {
    enum: ["creating_script", "reviewing_script", "reviewing_video", "video_approved", "published"],
  })
    .notNull()
    .default("reviewing_video"),
  targetDate: text("target_date"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const scripts = sqliteTable("scripts", {
  id: text("id").primaryKey(),
  videoId: text("video_id")
    .notNull()
    .unique()
    .references(() => videos.id, { onDelete: "cascade" }),
  content: text("content").notNull().default(""),
  plainText: text("plain_text").notNull().default(""),
  status: text("status", { enum: ["writing", "review"] })
    .notNull()
    .default("writing"),
  createdBy: text("created_by").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const projectActivity = sqliteTable("project_activity", {
  id: text("id").primaryKey(),
  videoId: text("video_id")
    .notNull()
    .references(() => videos.id, { onDelete: "cascade" }),
  actorUserId: text("actor_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  actorDisplayName: text("actor_display_name").notNull(),
  type: text("type", {
    enum: [
      "project.created",
      "phase.changed",
      "target_date.changed",
      "first_cut.uploaded",
    ],
  }).notNull(),
  data: text("data"),
  createdAt: text("created_at")
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

// =============================================================================
// Spaces (teams) — see docs/teams-feature.md
// =============================================================================

export const spaces = sqliteTable("spaces", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  requiredApprovals: integer("required_approvals").notNull().default(0),
  pipelineEnabled: integer("pipeline_enabled", { mode: "boolean" })
    .notNull()
    .default(false),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const spaceMembers = sqliteTable("space_members", {
  id: text("id").primaryKey(),
  spaceId: text("space_id")
    .notNull()
    .references(() => spaces.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["owner", "member"] })
    .notNull()
    .default("member"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const spaceInvites = sqliteTable("space_invites", {
  id: text("id").primaryKey(),
  spaceId: text("space_id")
    .notNull()
    .references(() => spaces.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  invitedBy: text("invited_by")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  status: text("status", {
    enum: ["pending", "accepted", "declined", "revoked"],
  })
    .notNull()
    .default("pending"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  acceptedAt: text("accepted_at"),
});

export const approvals = sqliteTable("approvals", {
  id: text("id").primaryKey(),
  videoId: text("video_id")
    .notNull()
    .references(() => videos.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  comment: text("comment"),
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
  resolvedReason: text("resolved_reason", { enum: ["manual", "text_edited"] }),
  annotation: text("annotation"),
  urgency: text("urgency", {
    enum: ["idea", "suggestion", "important", "critical"],
  })
    .notNull()
    .default("suggestion"),
  phase: text("comment_phase", {
    enum: ["script", "review"],
  })
    .notNull()
    .default("review"),
  textRange: text("text_range"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const notifications = sqliteTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    actorUserId: text("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    actorDisplayName: text("actor_display_name").notNull(),
    type: text("type", {
      enum: [
        "comment.created",
        "comment.reply",
        "script_comment.created",
        "script_comment.reply",
      ],
    }).notNull(),
    videoId: text("video_id")
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    commentId: text("comment_id")
      .notNull()
      .references(() => comments.id, { onDelete: "cascade" }),
    parentCommentId: text("parent_comment_id").references(() => comments.id, {
      onDelete: "cascade",
    }),
    spaceId: text("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    body: text("body"),
    href: text("href").notNull(),
    readAt: text("read_at"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    index("notifications_user_read_idx").on(table.userId, table.readAt),
    index("notifications_created_at_idx").on(table.createdAt),
  ],
);

export const commentReactions = sqliteTable(
  "comment_reactions",
  {
    id: text("id").primaryKey(),
    commentId: text("comment_id")
      .notNull()
      .references(() => comments.id, { onDelete: "cascade" }),
    emoji: text("emoji").notNull(),
    reactorUserId: text("reactor_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    reactorDisplayName: text("reactor_display_name"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    uniqueIndex("comment_reactions_user_unique")
      .on(table.commentId, table.emoji, table.reactorUserId)
      .where(sql`${table.reactorUserId} IS NOT NULL`),
  ],
);
