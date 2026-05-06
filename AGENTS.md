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

## Code style

- Minimize comments. Do not add comments that restate what the code is
  doing or narrate changes. Self-explanatory code is preferred.
- Only add a comment when it is genuinely useful — for example:
  - It explains something tricky, non-obvious, or counter-intuitive
    that a future reader could not infer from the code itself.
  - It will be helpful for production debugging (e.g. flagging a
    workaround for a known upstream bug, a subtle race condition, or
    a non-obvious failure mode).
- Prefer renaming variables/functions or restructuring code over
  adding a comment to clarify intent.
- When editing existing files, do not add explanatory comments about
  the change itself — the commit message and PR description are the
  right place for that.

## Pull requests

- Branch naming used in this repo: `feature-<topic>`, `fix-<topic>`,
  `chore-<topic>`, `feature-issue-<n>-<topic>` for issue-driven work.
- Conventional commit messages (e.g. `feat(actions): ...`, `fix(...)`,
  `chore(...)`, `docs(...)`).
- Reference issues with `Closes #<n>` in the PR body when applicable.

## Error handling

User-facing error messages must never include raw server errors (SQL,
stack traces, driver messages, table/column names). See section 13
"Error handling and user-facing messages" in the `astro-best-practices`
skill for the rules and the `friendlyActionErrorMessage` helper in
`src/lib/errors.ts`.
