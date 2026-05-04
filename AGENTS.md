# QuickCut Agent Instructions

These instructions apply to any AI coding agent working in this repo
(OpenCode, Claude Code, etc.). Read them before doing anything else.

## Project-local skills

This repo ships skills in `.opencode/skills/`. OpenCode auto-loads them, so
they should appear in your `<available_skills>` list. If a skill exists in
`.opencode/skills/` but is missing from your catalog, surface that to the
user — something is misconfigured.

Currently available:

- `worktree-setup` — copies local Cloudflare state (`.wrangler/state/`) and
  secrets (`.dev.vars`) into a new worktree, then applies migrations.

## Worktree workflow

This project uses `.worktrees/<branch>/` for feature work. The full setup is:

1. `git worktree add -b <branch> .worktrees/<branch> origin/main`
2. `pnpm install` inside the worktree
3. **Run the `worktree-setup` skill.** This step is mandatory. It copies
   `.dev.vars` and `.wrangler/state/v3` from the main checkout, then runs
   `pnpm db:migrate:local`. Without it, every Cloudflare binding (D1, KV,
   Stream, AI, Durable Objects) fails at runtime — the dev server starts
   but every request 4xx/5xx as soon as a binding is touched.
4. Only then start the dev server, run builds, or verify behavior.

If a worktree was created without step 3, symptoms include:

- 400 from Cloudflare Stream API (token undefined → `Bearer undefined`)
- Empty list views (D1 has no data, only schema)
- 500s touching anything that requires a secret

## Env files

- `.dev.vars` — gitignored, lives in the main checkout. Per-worktree copies
  are managed by the `worktree-setup` skill. Never commit this file.
- `.wrangler/state/` — gitignored local Cloudflare emulation data (D1
  SQLite, KV, Durable Objects, workflow state, image cache). Never commit.

## Pull requests

- Branch naming used in this repo: `feature/<topic>`, `fix/<topic>`,
  `chore/<topic>`, `feature/issue-<n>-<topic>` for issue-driven work.
- Conventional commit messages (e.g. `feat(actions): ...`, `fix(...)`,
  `chore(...)`, `docs(...)`).
- Reference issues with `Closes #<n>` in the PR body when applicable.
- Don't push to remote or open PRs without confirmation from the user.

## Astro Actions

This repo is migrating mutations from REST endpoints (`src/pages/api/...`)
to Astro Actions (`src/actions/index.ts`). When adding new server-side
mutation logic, prefer an action over a new REST handler. Use the existing
`requireUser` helper and `ActionError` codes. Look at `video.update`,
`comment.create`, or `space.update` for the established pattern.
