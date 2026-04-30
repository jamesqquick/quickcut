# Quick Cuts

Collaborative video review, built on Cloudflare. Organize work into team spaces, upload up to 5GB, stack new versions, share a link, and collect timestamped feedback from your team or clients — no account required for external reviewers.

> Think Frame.io, but small, focused, and running entirely on the edge.

## Features

- **Resumable 5GB uploads** — drag-drop with TUS-resumable direct uploads to Cloudflare Stream
- **Spaces for teams and clients** — create separate workspaces, invite members, switch contexts, and keep videos scoped to the right group
- **Version stacking** — upload new cuts into an ordered stack while keeping review history version-specific
- **Timestamped comments** — feedback pinned to the exact frame
- **Threaded replies + resolve** — keep review discussions organized
- **Approval workflows** — configure required approvals per space and track sign-off on each cut
- **Invite notifications** — pending space invites show in the account menu and can be accepted from `/notifications`
- **Public share links** — reviewers comment without an account; revoke anytime
- **Global HLS playback** — adaptive streaming via Cloudflare Stream
- **Auth + sessions** — email/password (PBKDF2), HttpOnly secure cookies, "remember me"

## Tech Stack

| Layer | Tech |
| --- | --- |
| Framework | [Astro 6](https://astro.build) (SSR) with React 19 islands |
| Styling | Tailwind CSS v4 (dark, purple-accented design system) |
| Database ORM | [Drizzle ORM](https://orm.drizzle.team) |
| Validation | Zod |
| Deployment | Cloudflare Workers via `@astrojs/cloudflare` |
| Tooling | Wrangler, pnpm, TypeScript |

## Cloudflare Usage

Quick Cuts runs end-to-end on Cloudflare's network. No origin servers, no separate CDN.

### Workers
The entire Astro app — auth, API routes, page rendering — is deployed as a single Worker via `@astrojs/cloudflare`. Sub-50ms cold starts in 300+ cities mean reviewers never wait on the network.

- Configured in `wrangler.jsonc` with `nodejs_compat` for Node-style APIs used by Drizzle.
- Astro middleware (`src/middleware.ts`) enforces auth for protected routes and API endpoints.

### D1
Serverless SQLite backs every persistent record. The `DB` binding gives the Worker direct, low-latency SQL access with zero infrastructure to manage.

Tables (see `src/db/schema.ts`):
- `users` — accounts (PBKDF2-hashed passwords)
- `sessions` — server-side sessions tied to `quickcut_session` cookie
- `spaces` — team/client workspaces, ownership, and required approval settings
- `space_members` — user membership and role per space
- `space_invites` — pending, accepted, declined, and revoked space invites
- `videos` — Stream UID, status, metadata, version group fields, and space ownership
- `share_links` — token, status, view count
- `comments` — timestamped, threaded (`parentId`), resolvable
- `approvals` — per-user approval records for videos

Migrations are managed via `drizzle-kit` and applied with `wrangler d1 migrations apply`.

### Durable Objects
A `VideoRoom` Durable Object — one instance per video version, routed deterministically with `getByName(videoId)` — fans out new comments to every connected reviewer in real time.

- The Astro app upgrades `/api/videos/[id]/live` into a WebSocket forwarded to the per-video DO
- Hibernatable WebSockets (`ctx.acceptWebSocket`) keep idle rooms at zero duration cost
- Comment POST routes call the DO's `broadcastComment` RPC after persisting to D1, so D1 stays the source of truth and the DO is purely a coordination/fan-out layer
- Anonymous reviewers must enter a display name on page load before any video, comments, or socket activity loads
- `wrangler.jsonc` declares the binding (`VIDEO_ROOM`) and the `new_sqlite_classes` migration; types are regenerated on `pnpm types` / `pnpm dev` / `pnpm build`

### Stream
All video lifecycle is offloaded to Cloudflare Stream:
- **Direct creator uploads** via TUS (`/accounts/{id}/stream?direct_user=true`) — files never pass through our Worker
- Automatic transcoding, thumbnail generation, duration detection
- Adaptive HLS/DASH delivery from the Cloudflare edge
- Webhook handler at `/api/webhooks/stream` flips `videos.status` from `processing` → `ready` / `failed`
- Result: zero egress fees, resumable multi-GB uploads, global playback out of the box

### Workers Assets
The static Astro build (`./dist`) is served via the `ASSETS` binding — cached at every edge POP for instant page loads. No separate CDN, no S3 bucket, no signing setup.

### Observability
Workers Observability is enabled in `wrangler.jsonc` for production logs and metrics.

### Why this stack matters
- **One platform** — compute, database, video, static assets, and observability live behind a single set of bindings
- **Zero ops** — nothing to provision, scale, or patch
- **Edge by default** — every request is served from the closest POP without extra config
- **Cost-aligned with usage** — Workers, D1, and Stream all scale to zero

## Project Structure

```
src/
├── components/      Astro + React components (VideoCard, VideoPlayer, CommentThread, ...)
├── db/              Drizzle schema and client factory
├── durable-objects/ Durable Object classes (VideoRoom for real-time comment fan-out)
├── layouts/         Layout.astro
├── lib/             Auth, Stream, spaces, invites, broadcast (DO RPC), realtime (client WS) helpers
├── middleware.ts    Session loader + route protection
├── worker.ts        Custom Worker entry — delegates to Astro and exports DOs
├── pages/
│   ├── index.astro      Marketing landing page
│   ├── login.astro      Sign-in form
│   ├── register.astro   Account creation
│   ├── dashboard.astro  Video grid (auth)
│   ├── notifications.astro  Pending space invites
│   ├── upload.astro     Upload (auth)
│   ├── spaces/[id]/settings.astro  Space settings, members, and invites
│   ├── videos/[id].astro    Authenticated review view
│   ├── invites/[token].astro    Direct invite accept/decline view
│   ├── s/[token].astro      Public share view (no auth)
│   └── api/             Auth, spaces, invites, videos, versions, comments, share-links, webhooks, /live (WS upgrade)
└── styles/          Tailwind + design tokens
migrations/          D1 migrations
wrangler.jsonc       Worker + bindings config (DB, Durable Objects, vars)
```

## Getting Started

### Prerequisites
- Node.js 22.12+
- pnpm
- A Cloudflare account with Workers, D1, and Stream enabled
- A Stream API token

### Setup

```sh
pnpm install
```

Create a `.dev.vars` file in the project root for local secrets (already gitignored):

```
STREAM_API_TOKEN=your_stream_api_token
STREAM_WEBHOOK_SECRET=your_webhook_secret
```

Update `wrangler.jsonc` with your `STREAM_ACCOUNT_ID`.

### Database

Generate and apply migrations locally:

```sh
pnpm db:generate
pnpm db:migrate:local
```

For the remote D1 database:

```sh
pnpm db:migrate:remote
```

### Develop

```sh
pnpm dev
```

App runs at `http://localhost:4321`.

### Deploy

```sh
pnpm deploy
```

Builds the Astro app and deploys to Cloudflare Workers via Wrangler.

## Scripts

| Command | Action |
| --- | --- |
| `pnpm dev` | Start the dev server |
| `pnpm build` | Build for production |
| `pnpm preview` | Preview the production build locally |
| `pnpm deploy` | Build + deploy to Cloudflare |
| `pnpm db:generate` | Generate Drizzle migrations from schema |
| `pnpm db:migrate:local` | Apply migrations to local D1 |
| `pnpm db:migrate:remote` | Apply migrations to remote D1 |
| `pnpm types` | Regenerate Cloudflare runtime types from `wrangler.jsonc` |

## License

MIT
