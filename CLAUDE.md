# Cadoro

A self-hostable SvelteKit PWA for timing focused work: routines made of blocks, with work that counts up past its target and breaks earned as a percentage of the time worked. Data stays in the browser, and there is no custom backend.

Current status: @docs/PROGRESS.md

How the code fits together: @docs/ARCHITECTURE.md

## Docs

- `docs/SPEC.md`: what the app does. Its rules and data model are the source of truth.
- `docs/PLAN.md`: stack, milestone order and what each milestone teaches.
- `docs/PROGRESS.md`: current status and the milestone checklist. Update it when a step or milestone finishes, and before ending a session partway through one.
- `docs/ARCHITECTURE.md`: the codemap, the invariants and the cross-cutting concerns, as the code is now. Update it in a step's docs round whenever the step changes what it describes.
- `docs/decisions/`: the decision log, one file per milestone, listed in its `README.md` with the rules for adding to it. Read the current milestone's file at the start of each step, and search the folder before settling something that may already be decided. Add to the current milestone's file whenever a decision is made or changed, with the reason and any options rejected. A changed decision is a new entry, and the old one gets a note pointing to it.

## Working style

- Build in vertical slices. Each milestone is cut into steps, each on its own branch and pull request, and each step is built in small rounds of about one commit. Each round makes a small set of changes, explains them and the related concepts listed in `docs/PLAN.md`, then stops for the user's questions before continuing.
- Commit in small steps as the work goes. Each commit is one logical change that passes the checks by itself, such as one module with its tests.
- Every change reaches `main` through a pull request, even docs, from the first one. The user reviews the code as it's written and asks Claude to merge. Never merge without being asked, and once CI exists, never before it passes.
- Rebase merge by default, so the small commits stay on `main`. Squash only when the commits aren't worth keeping.
- From the first deploy, every pull request that changes the app bumps the version, following the release steps in the README.
- Teaching is a core goal. Explain what each new command and piece of code does and why, without being asked, and break new commands down part by part. Don't re-teach what's already been covered. Svelte 5, SvelteKit and Tailwind CSS are new to the user, so explain them fully. React, Python, Java, C# and Selenium make good comparisons.
- Run commands and setup steps directly, then explain them. Only hand a step to the user if they ask, or if Claude can't run it.
- Create and change files with the file tools, not shell commands, so the user sees each diff. Use the project's tools for mechanical fixes, such as `npm run format`, and say which files changed.
- Prefer the conventional, idiomatic approach for Svelte, SvelteKit and Tailwind, and point out where it differs from React or other habits.
- Name branches `type/short-description`, describing the work, such as `feat/run-engine`. Never use milestone numbers.
- Use Conventional Commits for commit messages and PR titles, such as `feat(timer): add earned break`. `style` means code formatting only; visible styling changes are `feat` or `fix`.
- Write tests after writing the code. The code may need tweaks to get the behaviour exactly right, and the tests then lock that behaviour in to guard against regressions. For a bug fix, write the regression test first and see it fail. Don't use test-driven development, and don't chase coverage numbers.
- Find elements in tests by role and label first, and use test ids only where nothing a user sees identifies the element.
- Give the user the commands to run on the homelab, and explain each one.

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
