# Cadoro

A self-hostable SvelteKit PWA for timing focused work: routines made of blocks, with work that counts up past its target and breaks earned as a percentage of the time worked. Data stays in the browser, and there is no custom backend.

Current status: @docs/PROGRESS.md

How the code fits together: @docs/ARCHITECTURE.md

## Docs

- `docs/SPEC.md`: what the app does. Its rules and data model are the source of truth.
- `docs/PLAN.md`: the approved plan: how we work, the stack, and each milestone's work packages, versions and branches.
- `docs/PROGRESS.md`: current status and the milestone checklist. Update it when a step or milestone finishes, and before ending a session partway through one.
- `docs/ARCHITECTURE.md`: the codemap, the invariants and the cross-cutting concerns, as the code is now. Update it in a step's docs round whenever the step changes what it describes.
- `docs/decisions/`: the decision log, one file per milestone, listed in its `README.md` with the rules for adding to it. Read the current milestone's file at the start of each step, and search the folder before settling something that may already be decided. Add to the current milestone's file whenever a decision is made or changed, with the reason and any options rejected. A changed decision is a new entry, and the old one gets a note pointing to it.

## Commands

- `task check:quick`: lint, the format check, the typecheck and the Vitest tests, in seconds. Run it before each commit.
- `task check`: everything CI runs, in its order, adding the build and the Playwright tests. Run it before pushing.
- One test file: `npm test -- src/lib/run.test.ts`, or `npm run test:e2e -- e2e/timer.spec.ts --project desktop`.
- `task fix` formats every file and applies ESLint's fixes. `task --list` shows the rest. Under `timeout`, call `go-task`, since `task` is a shell alias.
- Outside CI, Playwright reuses a dev server already on the port, 5173 by default. If the user's own server is running older code, set `PORT` to a free port, such as `PORT=5198 task check`.

## Working style

The user decided on 2026-11-19 to finish Cadoro to 1.0.0 with as little of their time as possible. For this project only, that overrides `planning.md`, `learning.md` and the "never merge without being asked" line in `git.md`:

- `docs/PLAN.md` is the approved plan for every remaining milestone, so there is no plan mode per step. Its "How we work" has the roles, the milestone loop and the reviewer's brief. Follow it.
- No teaching, no explanations of concepts, no learning log entries and no stops for questions. Decide the conventional option that fits the spec, note it, and carry on.
- One pull request per milestone, with one version bump and release, following the release steps in the README. Rebase merge by default.
- Claude runs `task pr:merge` once CI is green and the review is settled. The permission prompt is the user's sign-off. Never work around it.
- The main session orchestrates and subagents write the code, tests and docs, as the plan says.
- Run commands and setup steps directly. Create and change files with the file tools, not shell commands. Use the project's tools for mechanical fixes, such as `npm run format`.
- Commit in small steps as the work goes. Each commit is one logical change that passes the checks by itself, such as one module with its tests.
- Good documentation and good tests, always: every rule, edge case, journey and failure has a test, and every declaration has a true TSDoc comment.
- Never skip, delete or loosen a test or a check to get to green. Guardrail files (`eslint.config.js`, `tsconfig.json`, `playwright.config.ts`, `.github/workflows/**`, `.claude/settings.json`) prompt before edits.
- Design: follow the existing screens and the design-preferences memory. The user sends feedback after using the app.
- Name branches `type/short-description`, describing the work, such as `feat/run-engine`. Never use milestone numbers.
- Use Conventional Commits for commit messages and PR titles, such as `feat(timer): add earned break`. `style` means code formatting only; visible styling changes are `feat` or `fix`.
- Write tests after writing the code. The code may need tweaks to get the behaviour exactly right, and the tests then lock that behaviour in to guard against regressions. For a bug fix, write the regression test first and see it fail. Don't use test-driven development, and don't chase coverage numbers.
- Find elements in tests by role and label first, and use test ids only where nothing a user sees identifies the element.
- Give the user the commands to run on the homelab.

## Stop rules

Stop and report only for:

- The merge prompt, a guardrail-edit prompt, or an install prompt for a package `docs/PLAN.md` doesn't name.
- The same failure surviving three fix attempts. Report what was tried. Never raise a timeout, add a retry or skip a test to get past it.
- A deploy to Pages failing twice, or `pages:check` failing after a deploy.
- Anything that would delete or rewrite the user's stored data outside a tested Dexie upgrade.

## Rules

- Keep the run logic and stats calculations in pure functions in `src/lib`, separate from Svelte components.
- Access data only through the storage interface.
- Calculate elapsed and remaining time from saved timestamps, never by counting ticks.
- Store exact moments as UTC timestamps. Work out local days, weeks and months only when showing stats.
- Store work time to the millisecond. Round only for display, apart from the earned break, which is rounded once to whole seconds when the break starts.
- Every change to what's stored after the first deploy needs a new Dexie schema version with an upgrade, and a test for it.
- Use only openly licensed or royalty-free art and sounds, and record each one's source and licence in the repo.
- Use synthetic test data only.
- Use Podman, not Docker, for container commands and docs.
- Keep the homelab's IP out of committed files.
