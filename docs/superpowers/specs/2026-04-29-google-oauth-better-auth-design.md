# Google OAuth with Better Auth — Design Spec

**Date:** 2026-04-29
**Status:** Approved
**Summary:** Replace hand-rolled email/password authentication with Google OAuth via Better Auth. Fresh start — no account migration. Restricted to `@cloudflare.com` Google Workspace accounts.

---

## Context

QuickCut currently uses a fully custom auth system:
- PBKDF2 password hashing via Web Crypto API (`src/lib/auth.ts`)
- Database-backed sessions in Cloudflare D1 via Drizzle ORM
- HTTP-only cookies (`quickcut_session`)
- Middleware-based route protection (`src/middleware.ts`)
- Registration restricted to `@cloudflare.com` emails
- Three API routes: `/api/auth/login`, `/api/auth/register`, `/api/auth/logout`

There are no OAuth providers configured. The goal is to replace email/password entirely with Google OAuth.

## Decision: Better Auth

**Chosen over:**
- **Arctic** — minimal OAuth-only library, would require keeping the hand-rolled session system
- **Auth.js** — effectively sunset, maintainers joined Better Auth
- **Lucia** — deprecated as a library
- **Raw OAuth 2.0** — no library, ~100 lines of code but no future extensibility
- **Cloudflare Access** — changes deployment model, harder local dev

**Reasons for Better Auth:**
- Full auth framework with Google OAuth built-in
- Drizzle adapter with SQLite/D1 support
- First-class Astro integration
- Workers-compatible (with `nodejs_compat` flag, already enabled)
- Future extensibility: 2FA, passkeys, RBAC via plugin ecosystem
- Auth.js team now maintains Better Auth — it's the recommended path forward

---

## Architecture

### What changes
- Replace entire hand-rolled auth system with Better Auth
- Single catch-all API route (`/api/auth/[...all]`) handles all auth flows
- Google OAuth is the only sign-in method
- Session management delegated to Better Auth (still DB-backed, still cookie-based)

### What stays the same
- D1 database (same binding)
- Drizzle ORM
- Middleware-based route protection pattern
- `Astro.locals.user` for accessing the current user
- All non-auth business logic (videos, spaces, comments, etc.)
- Share-link authentication (`verifyVideoAccess`)

### Workers-specific pattern
On Cloudflare Workers, the D1 binding is only available at request time (`env.DB`), not at module scope. The auth instance must be created per-request:

```typescript
export function createAuth(d1: D1Database) {
  const db = drizzle(d1, { schema });
  return betterAuth({
    database: drizzleAdapter(db, { provider: "sqlite", usePlural: true }),
    socialProviders: {
      google: { clientId: "...", clientSecret: "..." },
    },
  });
}
```

---

## Database Schema

### Fresh start approach
Drop existing `users` and `sessions` tables. Create Better Auth's required schema from scratch. Since this is a fresh start, no data migration is needed.

### Required tables (4)

**`users`** (modified from current):
| Column | Type | Notes |
|--------|------|-------|
| `id` | text PK | Same as current |
| `name` | text, not null | Replaces `displayName` |
| `email` | text, unique, not null | Same as current |
| `emailVerified` | boolean, default false | New — populated by Google OAuth |
| `image` | text, nullable | New — Google profile photo URL |
| `createdAt` | text, not null | Same as current |
| `updatedAt` | text, not null | New |

Removed: `passwordHash`

**`sessions`** (modified from current):
| Column | Type | Notes |
|--------|------|-------|
| `id` | text PK | Same as current |
| `userId` | text FK→users, cascade | Same as current |
| `token` | text, unique, not null | New — Better Auth uses a separate token field |
| `expiresAt` | text, not null | Same as current |
| `ipAddress` | text, nullable | New |
| `userAgent` | text, nullable | New |
| `createdAt` | text, not null | Same as current |
| `updatedAt` | text, not null | New |

**`accounts`** (new):
| Column | Type | Notes |
|--------|------|-------|
| `id` | text PK | |
| `userId` | text FK→users, cascade | |
| `accountId` | text, not null | Google user ID |
| `providerId` | text, not null | "google" |
| `accessToken` | text, nullable | OAuth access token |
| `refreshToken` | text, nullable | OAuth refresh token |
| `accessTokenExpiresAt` | text, nullable | |
| `refreshTokenExpiresAt` | text, nullable | |
| `scope` | text, nullable | |
| `idToken` | text, nullable | |
| `password` | text, nullable | Unused (no email/password) |
| `createdAt` | text, not null | |
| `updatedAt` | text, not null | |

**`verifications`** (new):
| Column | Type | Notes |
|--------|------|-------|
| `id` | text PK | |
| `identifier` | text, not null | |
| `value` | text, not null | |
| `expiresAt` | text, not null | |
| `createdAt` | text, not null | |
| `updatedAt` | text, not null | |

Mostly unused for Google-only OAuth, but required by Better Auth's schema.

### Impact on other tables
Tables referencing `users.id` (`videos`, `spaces`, `spaceMemberships`, `comments`, `shareLinks`, `notifications`, `invites`) are unaffected — the FK column type (text) and table name (`users`) are unchanged. Since this is a fresh start, these tables will also be empty.

---

## Files to Create

### `src/lib/auth.ts` (replaces current)
- Exports `createAuth(d1: D1Database)` function
- Configures Better Auth with:
  - Drizzle adapter (SQLite, `usePlural: true`)
  - Google social provider (`clientId`, `clientSecret`)
  - `before` hook on sign-in to enforce `@cloudflare.com` domain restriction
  - `BETTER_AUTH_SECRET` for signing
  - `BETTER_AUTH_URL` for base URL
- Email/password disabled (default in Better Auth)

### `src/lib/auth-client.ts` (new)
- Exports `authClient` using `createAuthClient()` from `better-auth/client`
- Used by React components for `authClient.signIn.social({ provider: "google" })`

### `src/pages/api/auth/[...all].ts` (new catch-all)
- Single API route handling all Better Auth endpoints
- Creates auth instance with `createAuth(env.DB)`
- Delegates to `auth.handler(request)`
- Better Auth automatically provides: `/api/auth/sign-in/social`, `/api/auth/callback/google`, `/api/auth/get-session`, `/api/auth/sign-out`, etc.

---

## Files to Delete

- `src/pages/api/auth/register.ts` — registration happens automatically on first Google sign-in
- `src/pages/api/auth/login.ts` — replaced by Better Auth's social sign-in endpoint
- `src/pages/api/auth/logout.ts` — replaced by Better Auth's sign-out endpoint
- `src/pages/register.astro` — no separate registration flow needed

---

## Files to Modify

### `src/middleware.ts`
- Replace manual cookie parsing + DB session lookup with `auth.api.getSession({ headers })`
- Populate `Astro.locals.user` and `Astro.locals.session` from Better Auth's response
- Keep same protected route lists (`/dashboard`, `/notifications`, `/upload`, `/videos/`, `/spaces/`)
- Keep same redirect behavior (unauthenticated page → `/login`, unauthenticated API → 401)
- Preserve WebSocket bypass for `/api/videos/[id]/live` (uses `verifyVideoAccess`, not session auth)

### `src/pages/login.astro`
- Remove email/password form
- Replace with "Sign in with Google" button
- Button triggers `authClient.signIn.social({ provider: "google", callbackURL: "/dashboard" })`
- Alternative: plain anchor link to `/api/auth/sign-in/social?provider=google&callbackURL=/dashboard` for no-JS approach
- Redirect authenticated users to `/dashboard` (keep existing behavior)

### `src/db/schema.ts`
- Update `users` table definition (drop `passwordHash`, rename `displayName` → `name`, add `emailVerified`, `image`, `updatedAt`)
- Update `sessions` table definition (add `token`, `ipAddress`, `userAgent`, `updatedAt`)
- Add `accounts` table definition
- Add `verifications` table definition

### `worker-configuration.d.ts`
- Add `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` to `Env` interface

### `wrangler.jsonc`
- No structural changes needed — secrets are set via `wrangler secret put`, not in the config file

### Components referencing `user.displayName`
- Update to `user.name` (Better Auth's field name)
- Requires a search across all `.astro` and `.tsx` files for `displayName` references

### `src/lib/auth.ts` → `verifyVideoAccess()`
- This function handles share-link token authentication for WebSocket connections
- It currently also does session-based auth as a fallback — the session lookup portion needs to be updated to use Better Auth's session format (lookup by `token` field instead of `id`)
- The share-link token logic is independent of auth and stays unchanged

---

## Domain Restriction

**Approach:** `before` hook on the Better Auth sign-in callback.

When a user completes the Google OAuth flow, Better Auth calls back with their profile. A `before` hook checks that the email ends with `@cloudflare.com`. If not, the sign-in is rejected and the user is shown an error message (e.g., "Only Cloudflare accounts are allowed").

This is enforced at the application level. Optionally, the Google Cloud OAuth consent screen can also be set to "Internal" (Workspace-only) for defense in depth, but the app-level check is the primary enforcement.

---

## Environment Variables

| Variable | Purpose | Local | Production |
|----------|---------|-------|------------|
| `GOOGLE_CLIENT_ID` | Google OAuth client ID | `.dev.vars` | `wrangler secret put` |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret | `.dev.vars` | `wrangler secret put` |
| `BETTER_AUTH_SECRET` | Signing key for tokens/cookies | `.dev.vars` | `wrangler secret put` |
| `BETTER_AUTH_URL` | Base URL of the app | `.dev.vars` | Workers env var |

### Getting Google OAuth credentials
1. Go to Google Cloud Console → APIs & Credentials
2. Create OAuth 2.0 Client ID (Web application)
3. Authorized redirect URIs:
   - Dev: `http://localhost:4321/api/auth/callback/google`
   - Prod: `https://<your-domain>/api/auth/callback/google`
4. Optional: Set consent screen to "Internal" for Workspace-only restriction

---

## Dependencies

### Add
- `better-auth` — core auth framework

### Remove
- None (no existing auth dependencies to remove)

### Unchanged
- `drizzle-orm`, `drizzle-kit` — already installed, Better Auth integrates via adapter

---

## Default space creation

Currently, the register endpoint creates a default "Personal" space and space membership for new users (`src/pages/api/auth/register.ts` lines 64-83). This logic needs to be preserved.

**Approach:** Use a Better Auth `after` hook on user creation (first OAuth sign-in creates the user). The hook creates the default space and membership, matching the current behavior.

---

## Migration strategy

Since this is a fresh start:
1. Generate a new Drizzle migration that drops old `users`/`sessions` tables and creates all 4 Better Auth tables
2. Apply migration to local D1 and production D1
3. All existing data (users, videos, spaces, etc.) will be lost — this is the intended "fresh start"

---

## Testing considerations

- Verify Google OAuth flow end-to-end (sign in → callback → session → dashboard)
- Verify `@cloudflare.com` restriction rejects non-Cloudflare accounts
- Verify session persistence across page navigations
- Verify sign-out clears session
- Verify protected routes redirect to login when unauthenticated
- Verify API routes return 401 when unauthenticated
- Verify WebSocket share-link access still works without session auth
- Verify default space creation on first sign-in
- Verify `user.name` renders correctly where `user.displayName` was used
