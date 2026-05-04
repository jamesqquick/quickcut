# QuickCut Agent Instructions

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

## Pull requests

- Branch naming used in this repo: `feature/<topic>`, `fix/<topic>`,
  `chore/<topic>`, `feature/issue-<n>-<topic>` for issue-driven work.
- Conventional commit messages (e.g. `feat(actions): ...`, `fix(...)`,
  `chore(...)`, `docs(...)`).
- Reference issues with `Closes #<n>` in the PR body when applicable.
- Don't push to remote or open PRs without confirmation from the user.
