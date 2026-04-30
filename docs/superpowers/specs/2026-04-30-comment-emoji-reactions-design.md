# Comment Emoji Reactions Design

## Goal

Add lightweight emoji reactions to comments so authenticated workspace members and anonymous share-link reviewers can acknowledge feedback without writing replies.

## Decisions

- Fixed emoji set: thumbs up, eyes, heart, laughing, party.
- Reactions are available on root comments and replies.
- Published/read-only videos lock reactions with comments.
- Reaction updates broadcast through the existing `VideoRoom` realtime channel and remain available through polling responses.
- Hover UI for reactor names is out of scope for v1, but the data model stores a display-name snapshot for future use.

## Architecture

Persist one row per comment, emoji, and reviewer in a new `comment_reactions` table. Authenticated reviewers are identified by `reactor_user_id`; anonymous share-link reviewers are identified by a stable per-browser localStorage ID sent with toggle requests.

Comment read APIs aggregate reactions into `reactions: Array<{ emoji: string; count: number; reactedByMe: boolean }>` so the UI can render compact pills without exposing individual reactor rows.

## API

- Authenticated route: `POST /api/comments/[id]/reactions`.
- Share-link route: `POST /api/share/[token]/comments/[id]/reactions`.
- Body: `{ emoji, anonymousReactorId?, displayName? }`.
- Response: `{ commentId, reactions }`.

Both routes verify the same access rules as commenting, reject unsupported emojis, reject writes on published videos, and toggle the current reviewer’s row for the selected emoji.

## UI

`CommentThread` renders reactions below both root comments and replies. Existing reactions render as pill buttons with count and active styling. A compact add button opens the fixed emoji set for emojis not already visible. Anonymous reviewers reuse the existing name gate and get a stable local browser ID.

## Sync

After each toggle, the API returns the updated aggregate and broadcasts `comment.reactions.update` through `VideoRoom`. Connected clients replace the matching comment’s reactions in local state. Polling responses also include aggregates as a fallback.

## Testing

Verify with TypeScript/build checks. The repo does not currently include a dedicated test runner, so implementation focuses on typed helpers and build validation.
