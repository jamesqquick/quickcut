# Teams & Spaces — Design Doc

## Status

Planning. This document captures the agreed-upon design for adding multi-user
collaboration to Quick Cuts. No implementation yet beyond the schema additions
in this PR.

## Goals

- Let users group videos by **team** so multiple people can review the same
  set of videos.
- Let videos require **N approvals** from team members before they're
  considered approved.
- Keep individual users' personal/private workspace intact.

## Non-Goals (v1)

- Notifications (email or in-app).
- Moving videos between teams after upload.
- Per-video or fine-grained role permissions.
- Rejection workflow. Videos are either approved or "not yet approved."
- Multi-team videos. A video belongs to exactly one space.

---

## Core Concept: Unified Spaces

Rather than modeling "personal" and "team" as two distinct concepts, **everything
is a space**.

- Every user gets a **default personal space** auto-created on registration. It
  starts with `requiredApprovals = 0` and only that user as a member.
- Users can **create additional spaces** and invite members.
- A user can also invite members to their personal space if they want to.
  Structurally there's nothing special about it — the only difference is it
  was created automatically and named "Personal" by default.

This simplifies the data model: videos and folders are all scoped to a `spaceId`.
There is no parallel "personal" code path.

---

## Data Model

### New Tables

#### `spaces`

A workspace that groups videos, folders, and members.

| Column              | Type    | Notes                                       |
| ------------------- | ------- | ------------------------------------------- |
| `id`                | text PK |                                             |
| `name`              | text    | e.g. "Personal", "Developer Relations Team" |
| `ownerId`           | text FK | -> `users.id`, ON DELETE cascade            |
| `requiredApprovals` | integer | default `0`                                 |
| `createdAt`         | text    | ISO timestamp                               |
| `updatedAt`         | text    | ISO timestamp                               |

#### `spaceMembers`

Membership records.

| Column      | Type    | Notes                                |
| ----------- | ------- | ------------------------------------ |
| `id`        | text PK |                                      |
| `spaceId`   | text FK | -> `spaces.id`, ON DELETE cascade    |
| `userId`    | text FK | -> `users.id`, ON DELETE cascade     |
| `role`      | text    | enum: `owner`, `member`              |
| `createdAt` | text    | ISO timestamp                        |

`(spaceId, userId)` unique.

#### `spaceInvites`

Pending invitations sent by email.

| Column      | Type    | Notes                                                   |
| ----------- | ------- | ------------------------------------------------------- |
| `id`        | text PK |                                                         |
| `spaceId`   | text FK | -> `spaces.id`, ON DELETE cascade                       |
| `email`     | text    | invitee's email (case-normalized)                       |
| `invitedBy` | text FK | -> `users.id`, ON DELETE cascade                        |
| `token`     | text    | unique invite token (used in accept URL)                |
| `status`    | text    | enum: `pending`, `accepted`, `declined`, `revoked`      |
| `createdAt` | text    | ISO timestamp                                           |
| `acceptedAt`| text    | nullable                                                |

#### `approvals`

Records who approved which video.

| Column      | Type    | Notes                                |
| ----------- | ------- | ------------------------------------ |
| `id`        | text PK |                                      |
| `videoId`   | text FK | -> `videos.id`, ON DELETE cascade    |
| `userId`    | text FK | -> `users.id`, ON DELETE cascade     |
| `comment`   | text    | nullable, optional approval note     |
| `createdAt` | text    | ISO timestamp                        |

`(videoId, userId)` unique. A user can't approve the same video twice. The
**uploader cannot approve their own video** (enforced at the API layer).

### Modified Tables

#### `videos`

- **Add** `spaceId` (text FK -> `spaces.id`, ON DELETE cascade).
- **Add** `uploadedBy` (text FK -> `users.id`, ON DELETE set null) — preserves
  who uploaded even if ownership conceptually shifts to the space.
- **Drop** `userId` (replaced by `spaceId` for ownership; `uploadedBy` for
  attribution).
- **Drop** `reviewStatus`. Approval state is computed from the count of rows in
  `approvals` for this video vs. `space.requiredApprovals`.

#### `folders`

- **Add** `spaceId` (text FK -> `spaces.id`, ON DELETE cascade).
- **Drop** `userId` (replaced by `spaceId`).

#### `transcripts`

- The `userId` column stays as-is for now. Transcripts are tied to a video, and
  the video's space owns the transcript by transitive association. No schema
  change needed.

---

## Migration Plan

A future PR (not this one) will run a migration that:

1. Creates the four new tables.
2. For every existing user, creates a default space named "Personal" with that
   user as `owner` and `requiredApprovals = 0`.
3. Adds the user as a `spaceMembers` row with `role = 'owner'`.
4. Adds `spaceId` and `uploadedBy` columns to `videos` (initially nullable).
5. Backfills every video's `spaceId` to its previous owner's default space, and
   sets `uploadedBy = videos.userId`.
6. Makes `videos.spaceId` NOT NULL.
7. Adds `spaceId` to `folders` and backfills.
8. Drops `videos.userId`, `videos.reviewStatus`, and `folders.userId`.

This migration must run before any API endpoints are switched to space-based
auth.

---

## Permissions Model (v1)

Two roles per space: **owner** and **member**.

| Action                              | Owner | Member | Uploader-only        |
| ----------------------------------- | ----- | ------ | -------------------- |
| Upload video                        | ✓     | ✓      |                      |
| View video / comment                | ✓     | ✓      |                      |
| Approve video (not own)             | ✓     | ✓      |                      |
| Approve own video                   | ✗     | ✗      | (always denied)      |
| Resolve comment                     | ✓     | ✓      |                      |
| Create / revoke share link          | ✓     | ✓      |                      |
| Create / manage folders             | ✓     | ✓      |                      |
| Delete video                        | ✓     | ✗      | uploader can         |
| Invite / remove members             | ✓     | ✗      |                      |
| Change space settings               | ✓     | ✗      |                      |
| Delete space                        | ✓     | ✗      |                      |

---

## Approval Workflow

- Each space has a `requiredApprovals` setting (default `0`).
- A video's "approval state" is computed:
  - `requiredApprovals == 0` → no approval needed, no review state shown.
  - `requiredApprovals > 0` and approval count is below threshold → "Pending review."
  - approval count ≥ threshold → "Approved."
- The video uploader cannot approve their own video.
- A user can approve a video at most once. They can un-approve (delete their
  approval row) if they change their mind.
- No rejection. The state is binary: approved or not yet approved.

---

## UI Changes (future PRs)

- **Space switcher** in the dashboard header. Defaults to the user's personal
  space. Lists every space the user is a member of.
- **Upload form** gets a space selector (defaulting to current space).
- **Space settings page** for owners: change name, change `requiredApprovals`.
- **Members page**: invite by email, list members, remove members.
- **Invite acceptance flow**: invitee receives a link with the invite token,
  signs in (or registers), and accepts.
- **Video detail view** gets an approval button (when in a space with
  `requiredApprovals > 0` and the viewer is not the uploader) plus a list of
  who has approved.

---

## Out of Scope / Open for Later

- Email notifications when a video is uploaded, commented on, or approved.
- In-app notification inbox.
- Moving videos or folders between spaces.
- More granular permissions (per-folder ACLs, viewer-only members, etc.).
- Required-approval rules per folder rather than per space.
- Approval expiration / re-approval after a new version is uploaded.
  - Note: when a new version is added to an existing video, we may want to
    reset its approvals. Decision deferred to the implementation PR.
