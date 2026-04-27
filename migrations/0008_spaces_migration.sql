-- Migration: Create space tables and wire spaces into videos and folders
-- This migration:
--   0. Creates the spaces, space_members, space_invites, and approvals tables
--   1. Creates a default "Personal" space for every existing user
--   2. Inserts space_members rows (role = 'owner') for each user
--   3. Rebuilds the videos table: adds spaceId + uploadedBy, drops userId + reviewStatus
--   4. Rebuilds the folders table: adds spaceId, drops userId
--
-- SQLite ALTER TABLE cannot drop columns in older versions, so we use the
-- table-rebuild (create-new, copy, drop-old, rename) pattern.
-- FK checks are disabled during table rebuilds to avoid constraint violations
-- when intermediate tables are dropped.

-- Disable FK enforcement for the duration of the table rebuilds.
PRAGMA foreign_keys = OFF;

-- Step 0: Create the four new tables (spaces, space_members, space_invites, approvals).
CREATE TABLE IF NOT EXISTS spaces (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  required_approvals INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS space_members (
  id TEXT PRIMARY KEY NOT NULL,
  space_id TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS space_invites (
  id TEXT PRIMARY KEY NOT NULL,
  space_id TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  invited_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  accepted_at TEXT
);

CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY NOT NULL,
  video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  comment TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Step 1: Create a default "Personal" space for every existing user.
-- We use the user's id prefixed with 'space_' as a deterministic space id.
INSERT INTO spaces (id, name, owner_id, required_approvals, created_at, updated_at)
SELECT 'space_' || id, 'Personal', id, 0, datetime('now'), datetime('now')
FROM users;

-- Step 2: Insert space_members rows for each user as owner of their default space.
INSERT INTO space_members (id, space_id, user_id, role, created_at)
SELECT 'sm_' || id, 'space_' || id, id, 'owner', datetime('now')
FROM users;

-- Step 3: Rebuild videos table — add spaceId + uploadedBy, drop userId + reviewStatus.
-- 3a. Create the new videos table with the target schema.
CREATE TABLE videos_new (
  id TEXT PRIMARY KEY NOT NULL,
  space_id TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  uploaded_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'processing',
  version_group_id TEXT,
  version_number INTEGER NOT NULL DEFAULT 1,
  is_current_version INTEGER NOT NULL DEFAULT 1,
  stream_video_id TEXT,
  stream_playback_url TEXT,
  thumbnail_url TEXT,
  duration REAL,
  file_name TEXT,
  file_size INTEGER,
  transcript_requested INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 3b. Copy data from old table. Backfill spaceId from user's default space, set uploadedBy = userId.
INSERT INTO videos_new (
  id, space_id, uploaded_by, folder_id, title, description, status,
  version_group_id, version_number, is_current_version,
  stream_video_id, stream_playback_url, thumbnail_url, duration,
  file_name, file_size, transcript_requested, created_at, updated_at
)
SELECT
  id, 'space_' || user_id, user_id, folder_id, title, description, status,
  version_group_id, version_number, is_current_version,
  stream_video_id, stream_playback_url, thumbnail_url, duration,
  file_name, file_size, transcript_requested, created_at, updated_at
FROM videos;

-- 3c. Drop old videos table and rename new one.
DROP TABLE videos;
ALTER TABLE videos_new RENAME TO videos;

-- 3d. Recreate indexes that existed on the old videos table.
CREATE INDEX IF NOT EXISTS idx_videos_space_id ON videos(space_id);
CREATE INDEX IF NOT EXISTS idx_videos_uploaded_by ON videos(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_videos_folder_id ON videos(folder_id);
CREATE INDEX IF NOT EXISTS idx_videos_stream_video_id ON videos(stream_video_id);
CREATE INDEX IF NOT EXISTS idx_videos_version_group_id ON videos(version_group_id);

-- Step 4: Rebuild folders table — add spaceId, drop userId.
-- 4a. Create the new folders table.
CREATE TABLE folders_new (
  id TEXT PRIMARY KEY NOT NULL,
  space_id TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  parent_id TEXT REFERENCES folders_new(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 4b. Copy data. Backfill spaceId from user's default space.
INSERT INTO folders_new (id, space_id, name, parent_id, created_at, updated_at)
SELECT id, 'space_' || user_id, name, parent_id, created_at, updated_at
FROM folders;

-- 4c. Drop old folders table and rename new one.
DROP TABLE folders;
ALTER TABLE folders_new RENAME TO folders;

-- 4d. Recreate indexes for folders.
CREATE INDEX IF NOT EXISTS idx_folders_space_id ON folders(space_id);
CREATE INDEX IF NOT EXISTS idx_folders_parent_id ON folders(parent_id);

-- Re-enable FK enforcement.
PRAGMA foreign_keys = ON;
