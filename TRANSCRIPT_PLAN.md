# Transcript Generation — Next Steps Plan

Last updated: 2026-04-27
Branch: main (PR #7 merged)

---

## Current State

The full transcript pipeline is merged and on `main`. The code covers:

- Flagship-gated upload opt-in checkbox (`UploadForm`, `UploadVersionModal`)
- `transcript_requested` column on `videos`
- `transcripts` table with full status lifecycle
- `TranscriptWorkflow` — Stream audio export → Whisper STT → LLM cleanup
- `GET/POST /api/videos/:id/transcript` API
- `TranscriptPanel` — polling UI with generate/retry actions
- Webhook + fallback status polling wired to trigger the workflow
- `@cloudflare.com` signup restriction

**Nothing is live yet** — the migration has not been applied to remote D1,
the Worker has not been deployed, and `STREAM_API_TOKEN` is not set as a secret.

---

## Step 1: Deploy (blocking — do this before anything else)

These three things must happen in order before any transcript feature works in production.

### 1a. Apply the D1 migration

```bash
pnpm db:migrate:remote
```

This creates the `transcripts` table and adds `transcript_requested` to `videos`.
Without this, every transcript API call will 500.

### 1b. Set the Stream API token secret

The workflow calls the Stream downloads API using `STREAM_API_TOKEN`.
It is referenced in `wrangler.jsonc` vars but must be a secret, not a plain var.

```bash
wrangler secret put STREAM_API_TOKEN
```

### 1c. Deploy the Worker

Registers `TranscriptWorkflow` with Cloudflare Workflows and activates all bindings.

```bash
pnpm deploy
```

---

## Step 2: Code cleanup (low-risk, do before or after deploy)

### 2a. Fix the migration journal

**File:** `migrations/meta/_journal.json`

The journal only has entries for migrations 0000–0003. Migrations 0005 and 0006
exist on disk but are missing from the journal. Drizzle-kit will not know about
them when generating future migrations, which can cause duplicate or conflicting
SQL output.

Add entries for both:

```json
{
  "idx": 4,
  "version": "6",
  "when": 1777200000000,
  "tag": "0005_add_video_versioning",
  "breakpoints": true
},
{
  "idx": 5,
  "version": "6",
  "when": 1777200000001,
  "tag": "0006_add_transcripts",
  "breakpoints": true
}
```

### 2b. Remove dead WorkflowBinding interface

**File:** `src/lib/transcripts.ts` lines 8–10 and line 87

The custom `WorkflowBinding` interface and cast are leftover.
`TRANSCRIPT_WORKFLOW` is already typed correctly on `Env` via wrangler types.
Replace:

```ts
const workflow = (env as Env & { TRANSCRIPT_WORKFLOW?: WorkflowBinding }).TRANSCRIPT_WORKFLOW;
```

With:

```ts
const workflow = env.TRANSCRIPT_WORKFLOW;
```

And delete the `WorkflowBinding` interface.

---

## Step 3: TranscriptPanel UX improvements

### 3a. Soften the `ready_raw_only` copy

**File:** `src/components/TranscriptPanel.tsx` line 57

Current copy: `"Cleanup failed, so this is the raw speech-to-text output."`

This is technically accurate but alarming. The cleanup step is intentionally
non-fatal. The user still has a usable transcript.

Suggested replacement:
- Title: `"Transcript ready"`
- Body: `"This transcript has not been formatted. It may contain minor punctuation or capitalization issues."`

### 3b. Add copy/download actions

**File:** `src/components/TranscriptPanel.tsx`

When status is `ready` or `ready_raw_only` and `text` is non-empty, show:

- **"Copy transcript"** — writes `cleanedText ?? rawText` to clipboard via
  `navigator.clipboard.writeText()`. Show a brief "Copied!" confirmation.
- **"Download .txt"** — creates a `Blob` and triggers a download as
  `{videoTitle}-transcript.txt`. Requires passing `title` as a prop from
  `VideoDetailView`.

The panel needs one new prop: `videoTitle: string` — passed from `VideoDetailView`
which already has `title` in scope.

---

## Step 4: Share view decision

**File:** `src/components/ShareView.tsx`

Currently transcripts are owner-only. External reviewers on the share link (`/s/[token]`)
do not see a transcript panel.

**Decision needed:** Should reviewers see the transcript?

**Option A — Keep it owner-only (no change needed)**
Transcript is an internal production tool. Reviewers see video + comments only.
This is the current behaviour.

**Option B — Show read-only transcript to reviewers**
Add a read-only `TranscriptPanel` to `ShareView`. Requires:
- A new public transcript endpoint that accepts a share token instead of a session:
  `GET /api/share/:token/transcript`
- The panel fetches from that endpoint instead of the owner-only one
- No generate/retry buttons for anonymous users

Recommendation: **Option A for now**. Transcripts are a production/editing tool,
not a reviewer feature. Add it to share view in a later iteration if there is
demand for it.

---

## Step 5: End-to-end smoke test checklist

After deploying, verify the full flow works with a real video:

- [ ] Upload a short video (under 2 minutes) with "Generate transcript" checked
- [ ] Confirm `transcript_requested = true` in D1 for that video
- [ ] Confirm Stream webhook fires and the `TranscriptWorkflow` instance is created
      (check Cloudflare dashboard → Compute → Workflows)
- [ ] Watch `TranscriptPanel` cycle through:
      `queued → exporting_audio → waiting_for_audio → transcribing → cleaning → ready`
- [ ] Confirm `cleanedText` is populated in D1
- [ ] Try uploading without checking the checkbox — confirm no transcript row is created
- [ ] Try the "Generate transcript" button for a video that was not opted in at upload
- [ ] Try the "Retry transcript" button after manually setting a transcript to `failed` in D1
- [ ] Confirm a user whose email is not in the Flagship targeting rule never sees the checkbox

---

## Step 6: Remaining known gaps (future PRs)

These are deliberate deferrals from the original plan, not bugs.

### Monthly usage quotas and limits

No per-user monthly limits or per-video duration caps exist yet. This was
intentionally deferred because signups are restricted to `@cloudflare.com`
and there will be very few users initially.

When ready:
- Add a `usage_ledger` table
- Enforce `MAX_TRANSCRIPT_DURATION_SECONDS` (e.g. 600s) before starting workflow
- Enforce `MAX_MONTHLY_TRANSCRIPT_MINUTES` per user per calendar month
- Add `maxDurationSeconds` to Stream TUS upload URL creation

### Transcript on the share view

See Step 4 above. If decided, requires a new share-token-authenticated
transcript endpoint.

### VTT caption display

The `vtt` field is stored on the `transcripts` row. It is not used anywhere
in the UI yet. A future feature could render synced captions over the Stream
player using the VTT data.

### Transcript search

Full-text search across `transcripts.cleanedText` using D1's built-in FTS
(SQLite FTS5) or a Vectorize index for semantic search.

---

## Copy/paste prompt for a new session

```
I'm working on the QuickCut project at /Users/jamesqquick/code/quickcut.
It's an Astro + Cloudflare Workers + D1 app. I'm currently on the main branch
which has transcript generation code merged but not yet deployed or verified.

Please read TRANSCRIPT_PLAN.md in the project root for full context.

Here is what I need done in this session:

TASK 1 — Fix migration journal
Add missing entries for 0005_add_video_versioning and 0006_add_transcripts
to migrations/meta/_journal.json so drizzle-kit knows about them.

TASK 2 — Remove dead WorkflowBinding interface
In src/lib/transcripts.ts, delete the WorkflowBinding interface (lines 8-10)
and replace the cast on line 87 with env.TRANSCRIPT_WORKFLOW directly.
The binding is already typed on Env via wrangler types.

TASK 3 — Soften ready_raw_only copy in TranscriptPanel
In src/components/TranscriptPanel.tsx, change the ready_raw_only status copy:
- Title: "Transcript ready"
- Body: "This transcript has not been formatted. It may contain minor punctuation
  or capitalization issues."

TASK 4 — Add copy and download actions to TranscriptPanel
When a transcript is ready (status "ready" or "ready_raw_only") and text exists:
- Add a "Copy transcript" button using navigator.clipboard.writeText()
  with a brief "Copied!" confirmation state
- Add a "Download .txt" button that triggers a file download
- Pass videoTitle as a new prop from VideoDetailView so the downloaded
  filename is meaningful (e.g. "my-video-transcript.txt")

After all changes, run pnpm build to verify. If everything passes, commit
with a clear message and push to a new branch for a PR.

Key files to read first:
- TRANSCRIPT_PLAN.md (this plan)
- src/components/TranscriptPanel.tsx
- src/components/VideoDetailView.tsx
- src/lib/transcripts.ts
- migrations/meta/_journal.json
- wrangler.jsonc
```
