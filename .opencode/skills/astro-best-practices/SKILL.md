---
name: astro-best-practices
description: Best practices and conventions for writing QuickCut application code on Astro 6 SSR + Cloudflare Workers + D1 + Drizzle ORM. Covers server-first data fetching in `.astro` frontmatter, Astro API route handlers under `src/pages/api/`, Zod request validation, `Astro.locals.user` auth and `verifySpaceAccess` checks, Drizzle/D1 query patterns via `createDb(env.DB)` and `src/lib/*` helpers, React component data flow (props from server, no useEffect fetching), realtime broadcasts via Durable Objects, design tokens in `src/styles/tailwind.css`, named exports, shared types in `src/types.ts`, and file placement. Use this skill whenever writing or modifying `.astro` pages, files under `src/pages/api/`, Drizzle queries, validation schemas, React components that talk to the server, or any code handling authenticated user requests in this repo. Also trigger on "add an API endpoint", "create a page", "fetch data", "mutation handler", "auth check", "space access", "Drizzle query", "new table", "new component", or any task touching server-side request handling, schema changes, or styling decisions in QuickCut.
---

# QuickCut — Development Best Practices

Patterns and conventions for contributing to QuickCut.
The stack is **Astro 6 (SSR) + Cloudflare Workers + D1 + Drizzle ORM**.

Apply these rules when writing new code or modifying existing code in this
repo. Prefer following an established pattern in the codebase over inventing
a new one; if a rule below conflicts with what you find in `src/`, surface
the discrepancy rather than silently picking one.

---

## 1. Server-first by default

Astro runs on the server at the edge. Use it.

- **Fetch data in `.astro` frontmatter**, never in a `useEffect` on mount unless
  the data genuinely can't be known until the user interacts.
- **Pass data as props** from the `.astro` page down to React components. The
  React component should receive ready-to-render data, not fetch it itself.
- **Access `Astro.locals.user` directly** in `.astro` files; never re-fetch the
  session from a client component.

```astro
---
// Good: fetch on the server, pass as props
const db = createDb(env.DB);
const videos = await getUserVideos(db, user.id);
---
<VideoList client:load videos={videos} />
```

```tsx
// Bad: fetching on mount
useEffect(() => {
  fetch('/api/videos').then(...)
}, []);
```

---

## 2. Use Astro API routes for mutations

All create / update / delete operations must go through typed **Astro API route
handlers** (`src/pages/api/**/*.ts`), not inline `fetch` calls to arbitrary URLs.

Every handler must:

1. Check `locals.user` first — return `401` immediately if missing.
2. Verify space/resource access with `verifySpaceAccess` (or the appropriate
   lib helper) before touching any data.
3. Parse and validate the request body with a **Zod schema** from
   `src/lib/validation.ts`. Do not read raw fields off `request.json()`.
4. Return a typed JSON response. Use `Response.json()` for consistency.

```ts
// src/pages/api/videos/[id]/comments.ts
export const POST: APIRoute = async ({ params, locals, request }) => {
  if (!locals.user) return new Response(null, { status: 401 });

  const { id } = params;
  await verifySpaceAccess(db, locals.user.id, spaceId); // always verify

  const parsed = commentSchema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: parsed.error }, { status: 400 });

  // ... mutation ...
  return Response.json(result, { status: 201 });
};
```

---

## 3. Keep React components UI-only

A React component (`*.tsx`) is a **UI + interactivity layer**, not a data layer.

- Receive all initial data as props from the `.astro` page.
- Only call API routes for **user-triggered mutations** (button clicks, form
  submits) or **live updates** (polling for processing status, WebSocket events).
- Do not call API routes on initial mount just to load data that could have been
  server-rendered.

```tsx
// Good: props come from the server
export function VideoList({ videos }: { videos: Video[] }) { ... }

// Bad: fetches its own initial data
export function VideoList() {
  const [videos, setVideos] = useState([]);
  useEffect(() => { fetch('/api/videos').then(...) }, []);
}
```

---

## 4. Add new Zod schemas to `src/lib/validation.ts`

All request body schemas live in one place. Do not inline Zod schemas inside
route handlers. This makes schemas reusable, auditable, and easy to find.

---

## 5. Database access

- Always instantiate the DB with `createDb(env.DB)` — never import a singleton.
- Encapsulate multi-step or reused queries in `src/lib/*.ts` helpers that accept
  a `db` argument.
- Keep query logic out of React components entirely; it belongs in `.astro`
  frontmatter or API route handlers.

```ts
// Good: lib helper that accepts db
export async function getUserVideos(db: DrizzleD1, userId: string) { ... }

// Bad: Drizzle query inside a React component or floating in a page without a helper
```

---

## 6. Access control

- Call `verifySpaceAccess(db, userId, spaceId)` at the top of every API route
  that reads or writes space-scoped data. Do not rely on filtering by `userId`
  alone.
- For public share-link routes (`/s/[token]`), validate the share token and
  derive the space/video from it — never accept a raw `spaceId` or `videoId`
  from the query string without verifying access.
- Never trust client-supplied resource IDs without a corresponding access check.

---

## 7. Prefer `crypto.randomUUID()` for IDs

The project uses `crypto.randomUUID()` throughout. Do not use `nanoid` or
`Math.random()`-based IDs, even though `nanoid` is installed.

---

## 8. Realtime (Durable Objects + WebSockets)

- **D1 is the source of truth.** Always persist to D1 before broadcasting to the
  Durable Object.
- Broadcast is best-effort via `broadcastNewComment` / `broadcastApprovalUpdate`
  helpers in `src/lib/broadcast.ts`. A broadcast failure must never break the
  mutation — wrap calls appropriately.
- Client-side WebSocket logic belongs in `src/lib/realtime.ts`. Reconnection
  and exponential backoff are already handled there; reuse it.

---

## 9. Client-side state

- No state management library. Use `useState` / `useRef` / `useReducer` local
  to the component.
- Lift state only as far up as needed within the React tree. If two components
  need the same data, consider whether it should be server-rendered and passed as
  props instead.

---

## 10. Styling

- Use **semantic design tokens** only: `bg-bg-primary`, `text-text-secondary`,
  `border-border-default`, `text-accent-primary`, etc. Do not use raw Tailwind
  color classes like `bg-zinc-900` or `text-gray-400`.
- Design tokens are defined in `src/styles/tailwind.css` under `@theme`. Add new
  tokens there rather than hardcoding values inline.

---

## 11. TypeScript

- Prefer **named exports** over default exports for all components, helpers, and
  types.
- Shared types live in `src/types.ts`. Add new cross-cutting types there rather
  than defining them inline in a single file.
- Use `satisfies` or explicit return types on exported functions so callers get
  type-checked props/return values.

---

## 12. File placement cheat sheet

| What you're adding | Where it goes |
|--------------------|---------------|
| New page | `src/pages/*.astro` |
| New API endpoint | `src/pages/api/**/*.ts` |
| Interactive React component | `src/components/*.tsx` |
| Astro (server-only) component | `src/components/*.astro` |
| Reusable DB query helper | `src/lib/*.ts` |
| Request body Zod schema | `src/lib/validation.ts` |
| Shared TypeScript type | `src/types.ts` |
| New DB table / column | `src/db/schema.ts` + new migration |
| Design token | `src/styles/tailwind.css` |
| Async background job | `src/workflows/` (Cloudflare Workflow) |

---

## 13. Error handling and user-facing messages

User-facing error messages must never include raw server errors (SQL
statements, stack traces, driver messages, table or column names). The
goal is that a stranger could read the message without losing trust in
the app and without learning anything about the internals.

Three rules apply across actions, API routes, and React components.

### Rule 1 — Wrap server-side DB writes and external calls

In Astro actions (`src/actions/index.ts`) and API route handlers
(`src/pages/api/**/*.ts`), wrap every `db.insert` / `db.update` /
`db.delete` and every external `fetch` (Stream, mail, AI, etc.) in a
`try/catch`. On failure:

- `console.error` with a prefix that identifies the handler, e.g.
  `console.error("[uploadVersion] insert failed:", error)`.
- Throw a clean `ActionError` (in actions) or return
  `Response.json({ error: "<friendly message>" }, { status: 500 })`
  (in API routes).
- The friendly message must:
  - Be short — one sentence, ≤ ~120 characters.
  - Be safe for any user to read.
  - Suggest a next step when possible ("Please try again",
    "Refresh the page").
  - Never include SQL, table names, column names, or stack traces.

```ts
try {
  await db.insert(videos).values({ ... });
} catch (error) {
  console.error("[uploadVersion] insert failed:", error);
  throw new ActionError({
    code: "INTERNAL_SERVER_ERROR",
    message: "We couldn't save the new version. Please try again.",
  });
}
```

### Rule 2 — Validate before you persist

Catch the bad-input class of error before it ever reaches D1. This
removes most of the cases where Rule 1 would fire.

- Use a Zod schema from `src/lib/validation.ts` for every request body.
  Do not read raw fields off `request.json()`.
- Verify foreign-key parents exist (e.g. `folder_id` → `folders.id`)
  with an explicit `db.select` and a `NOT_FOUND` `ActionError` **before**
  the `insert`. The folder-creation flow already does this; follow that
  pattern.
- Coerce empty strings to `null` for nullable text columns
  (`description: description?.trim() || null`) so D1 doesn't reject
  on FK or `NOT NULL` constraints when the client sends `""`.

### Rule 3 — Never display raw server errors in the UI

In React components, all `setError(...)` and
`showToast(..., "error")` calls that consume server-returned messages
must route through `friendlyActionErrorMessage(message, fallback)` from
`src/lib/errors.ts`. The helper detects raw SQL / Drizzle / D1 patterns
and substitutes the fallback.

The fallback is required and should be specific to the action — avoid
generic strings like "Something went wrong". Give the user something
they can act on.

```tsx
import { friendlyActionErrorMessage } from "../lib/errors";

const { data, error: actionError } = await actions.video.uploadVersion({ ... });
if (actionError) {
  setError(
    friendlyActionErrorMessage(
      actionError.message,
      "We couldn't start the upload. Please try again.",
    ),
  );
  return;
}
```

Anti-pattern — passes the raw server message straight to the UI:

```tsx
setError(err instanceof Error ? err.message : "Upload failed");
```

Error containers should also include `break-words` (or equivalent) as a
layout safety belt so any message that does slip through wraps cleanly
instead of overflowing the modal.

### Pre-merge checklist

When adding or modifying an action, API route, or any UI that triggers
a server mutation, confirm before requesting review:

- [ ] Every `db.insert` / `db.update` / `db.delete` and every external
      `fetch` is wrapped in `try/catch` with a friendly `ActionError` or
      JSON `Response`.
- [ ] Every `setError` / `showToast(..., "error")` consuming a server
      message goes through `friendlyActionErrorMessage` with a
      non-generic fallback.
- [ ] No client-facing error string mentions SQL, table/column names,
      stack traces, or driver-specific text.
