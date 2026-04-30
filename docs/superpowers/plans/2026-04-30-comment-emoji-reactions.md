# Comment Emoji Reactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add D1-backed emoji reaction toggles for root comments and replies.

**Architecture:** Store reactions in a separate table, aggregate them into comment API responses, expose authenticated and share-link toggle endpoints, and broadcast aggregate updates through `VideoRoom`.

**Tech Stack:** Astro API routes, React 19, Drizzle ORM, Cloudflare D1, Durable Objects, TypeScript.

---

## File Structure

- Create `migrations/0015_add_comment_reactions.sql` for the D1 table and uniqueness indexes.
- Modify `src/db/schema.ts` to add the `commentReactions` Drizzle table.
- Modify `src/types.ts` to define reaction constants and response types.
- Modify `src/lib/comments.ts` to aggregate reactions and toggle rows.
- Modify comment GET/POST/reply routes to return reaction metadata.
- Create `src/pages/api/comments/[id]/reactions.ts` and `src/pages/api/share/[token]/comments/[id]/reactions.ts` toggle endpoints.
- Modify `src/lib/broadcast.ts`, `src/durable-objects/VideoRoom.ts`, and `src/lib/realtime.ts` for realtime reaction updates.
- Modify `src/components/CommentThread.tsx` to render and toggle reaction pills.

### Task 1: Data Model And Types

- [ ] Add the migration table with cascade delete, reviewer columns, and unique indexes for authenticated and anonymous reviewers.
- [ ] Add `commentReactions` to the Drizzle schema.
- [ ] Add `COMMENT_REACTION_EMOJIS`, `CommentReactionEmoji`, and `CommentReactionSummary` to `src/types.ts`.

### Task 2: Reaction Helpers

- [ ] Update `getCommentsWithNames` to accept current reviewer identity and attach reaction aggregates.
- [ ] Add reusable helpers to aggregate reactions and toggle a reaction row.
- [ ] Ensure new comments and replies return an empty `reactions` array.

### Task 3: Toggle APIs

- [ ] Implement authenticated toggle route with workspace access and published-video lock checks.
- [ ] Implement share-link toggle route with token access, anonymous reviewer ID, display name, and published-video lock checks.
- [ ] Broadcast updated reaction summaries after successful toggles.

### Task 4: Realtime Sync

- [ ] Add a `BroadcastCommentReactions` shape and `comment.reactions.update` server message.
- [ ] Add `broadcastCommentReactions` helper and client handler support.
- [ ] Update `CommentThread` websocket handling to replace matching comment reactions.

### Task 5: UI

- [ ] Add a stable anonymous reactor ID in `CommentThread` localStorage.
- [ ] Add reaction pills for root comments and replies.
- [ ] Disable reaction writes when `readOnly` is true.
- [ ] Optimistically rely on API responses and broadcasts to update local state.

### Task 6: Verification And PR

- [ ] Run `pnpm build` with the Cloudflare account ID set for non-interactive Wrangler.
- [ ] Commit the implementation on `feature/comment-emoji-reactions`.
- [ ] Push the branch and create a GitHub PR linked to issue #22.
