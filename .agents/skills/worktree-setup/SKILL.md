---
name: worktree-setup
description: Use immediately after creating a new git worktree in the QuickCut repo. Copies local Wrangler/D1 state and .dev.vars from the main checkout into the worktree so the local DB has data and the app has its environment secrets, then runs pending migrations. Triggers on "worktree setup", "wrangler state", "local db missing", "missing dev.vars in worktree", or any post-worktree-creation step in QuickCut. Complements the global using-git-worktrees skill, which handles generic worktree creation and dependency install.
---

# Worktree Setup (QuickCut)

## Overview

When a new git worktree is created for the QuickCut repo, it starts with no
local Cloudflare state and no environment secrets, because both `.wrangler/`
and `.dev.vars` are gitignored and therefore do not propagate across worktrees.

This skill restores those files by copying them from the main checkout, then
applies any database migrations the new branch may have added on top.

**Announce at start:** "I'm using the worktree-setup skill to copy local state
from the main checkout."

## When to use

Run this **immediately after** the global `using-git-worktrees` skill finishes
its generic setup (worktree creation, `pnpm install`, baseline checks) and
**before** trying to start the dev server, run migrations on a fresh DB, or
verify anything that depends on local data.

Do not run this in the main checkout. It is a no-op there.

## Why

- `.wrangler/state/` holds the local Miniflare emulation: D1 SQLite database,
  KV, Durable Objects, workflows, and image cache. Without it the worktree
  has no local data — every list view is empty and migrations apply against
  a brand-new DB.
- `.dev.vars` holds local development secrets (auth secrets, API tokens, etc.)
  that the worker needs at runtime. Without it `wrangler dev` will fail or
  behave unpredictably.
- Both files are correctly gitignored, so they never travel via git. They
  must be copied between worktrees manually on the same machine.

## Steps

Run all commands from inside the **new worktree** (not the main checkout):

```bash
# 1. Locate the main checkout. `git worktree list --porcelain` always lists
#    the main worktree first.
main=$(git worktree list --porcelain | head -1 | awk '{print $2}')

# 2. Copy local Cloudflare state if the worktree doesn't already have any.
[ ! -d .wrangler/state ] && [ -d "$main/.wrangler/state" ] \
  && mkdir -p .wrangler \
  && cp -R "$main/.wrangler/state" .wrangler/state

# 3. Copy local development secrets if the worktree doesn't already have any.
[ ! -f .dev.vars ] && [ -f "$main/.dev.vars" ] \
  && cp "$main/.dev.vars" .dev.vars

# 4. Apply any migrations this branch adds on top of the copied DB.
pnpm db:migrate:local
```

After these steps, the worktree should behave like a fresh clone of your main
local environment, plus whatever schema changes the branch introduces.

## Quick Reference

| Situation | Action |
|---|---|
| `.wrangler/state` already exists in worktree | Skip the copy; assume it was intentional |
| `.dev.vars` already exists in worktree | Skip the copy; assume it was intentional |
| Main checkout has no `.wrangler/state` | Warn the user. Run migrations against the fresh DB. They will have an empty local DB. |
| Main checkout has no `.dev.vars` | Warn the user — they'll need to create one manually before running the app. |
| Running from the main checkout itself | No-op. Skill is only for worktrees. |
| Branch has migrations newer than main's local DB | `pnpm db:migrate:local` (step 4) handles it |
| Branch is missing migrations that main's local DB already applied | The copied DB is a superset; nothing to do |

## Security

- `.dev.vars` contains secrets. Copying it locally between worktrees on the
  **same machine** is fine — those secrets are already on disk.
- Never commit `.dev.vars`. It is in `.gitignore` for a reason.
- Never copy `.dev.vars` across machines without re-reviewing contents and
  rotating anything that should not leave the original host.

## Integration

**Pairs with:**
- **using-git-worktrees** (global) — that skill creates the worktree and runs
  generic setup like `pnpm install`. This skill runs immediately after, layering
  QuickCut-specific local state on top.

**Does not replace:**
- The global worktree skill. PR creation, branch naming, and `.gitignore`
  verification still come from there.

## Example Workflow

```
[using-git-worktrees creates .worktrees/feature-x and runs pnpm install]

You: I'm using the worktree-setup skill to copy local state from the main checkout.

[Detect main checkout via `git worktree list --porcelain`]
[Copy .wrangler/state - 744K]
[Copy .dev.vars]
[Run pnpm db:migrate:local - migrations applied]

Worktree at .worktrees/feature-x is ready with copied local state.
```

## Red Flags

**Never:**
- Run this skill in the main checkout (use `git rev-parse --git-common-dir`
  vs `--git-dir` to detect; if equal, you are in main).
- Overwrite an existing `.dev.vars` or `.wrangler/state` without asking. The
  user may have intentionally diverged the worktree's local state.
- Copy `.dev.vars` to a worktree that lives on a different machine.

**Always:**
- Verify you are inside a worktree before copying.
- Skip steps whose source files are missing rather than failing the whole flow.
- Run `pnpm db:migrate:local` after copying so the worktree's branch-specific
  migrations are applied.
