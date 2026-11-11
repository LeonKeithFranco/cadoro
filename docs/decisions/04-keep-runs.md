# Decisions: milestone 4, Keep runs

Runs survive reloads, every work period is recorded, and every open tab shows the same run.

## Planning, 2026-11-11

### Milestone 4's steps

- Milestone 4 has four steps, each with its own branch and pull request: routines in storage (`feat/routine-storage`), recording runs and work periods (`feat/run-records`), keeping the run in progress across a reload (`feat/restore-run`), and sharing the run across tabs (`feat/shared-run`).
- Each step that changes the app is a minor bump, 0.3.0 to 0.6.0, as Conventional Commits map `feat` to semantic versioning's minor version.
- `lastRoutineId` and the Settings line saying whether storage is persistent come with Settings in milestone 5, and the change log with milestone 8, so this milestone stays within the plan's bullets.

### Tabs share one run

- Once the run in progress is saved, every open tab, the installed app included, shares one run: each follows the saved run through a Dexie `liveQuery`, so a press in one shows in the others, and a tab takes on another's changes without saving them again, so work is recorded once. It's the milestone's last step, so the rest works first.
- Each tab keeping its own run, with the last save winning, was rejected, because Play in two tabs would save the same work periods twice and inflate the stats. One tab owning the timer through the Web Locks API, with the others saying it's open elsewhere, was rejected as new screens and a browser API the plan doesn't list, for a worse experience than sharing.

### Storage

- All data goes through one interface, `CadoroStorage`, in `src/lib/storage/`, with a Dexie backend for the app and an in-memory one for tests, both run against one shared `describe.each` suite, as in the weight tracker. It's named for the app because the browser already has a global `Storage` type. It has one layer for now, and milestone 8's change log wraps it.
- Storage tests run in Vitest's browser project, against Chromium's real IndexedDB, as `*.browser.test.ts`. `fake-indexeddb` in Node, as in the weight tracker, was rejected, because the testing rules say to fake only what a test can't use for real.
- Dexie's schema version 1 declares every table this milestone needs, as the spec's data model already defines them: `routines`, `runs`, `workPeriods` and `runInProgress`. Adding tables step by step was rejected, because each step deploys, so each would need a schema version of its own within one milestone.
- Times are stored as UTC ISO strings, as the project's rules say, while the engine keeps working in milliseconds. Pure functions in `src/lib` convert between the two at the storage boundary.

### Loading before the app renders

- The root `+layout.ts` gets a `load` function that opens storage, creates the starter routines on first launch, and builds the `TimerSession`, so the app renders once its data is ready. The layout's `data` reaches every page below it, so the Timer page takes the session from `data`, and the module-level `timerSession` goes.
- Svelte's context API, which the plan lists, was considered for handing the session down, and isn't needed: the session goes only one level down, as a prop, and context is for values that deep components need without passing props through every level.

## Before step 1: the docs (`docs/restructure-project-docs`), 2026-11-11

### The docs

- The user asked to improve `docs/` before step 1, following established conventions. `CLAUDE.md` imported `PROGRESS.md` and the 57 KB `DECISIONS.md`, about 16k tokens, into every session, and the log grew by about 5k tokens a milestone. Claude Code's memory docs say `@` imports load in full at launch and "don't reduce its context cost". The log was also one list of 44 topics, newest first, so today's rules had to be pieced together from their history.
- The log moved to `docs/decisions/`, one file per milestone, with a `README.md` listing each file's topics and the rules for adding to it, as MADR keeps records in `docs/decisions/` with numbered names. Entries moved word for word. Inside each file they run oldest first under their step's heading, with each topic as a `###` heading, because a milestone's file reads best as a story, while newest first suited one ever-growing file.
- A decision that a later one changes stays as it was, with a last **Changed later** bullet pointing to the change, as Nygard's decision records keep a superseded record and point to its replacement. Four entries got one in the move.
- `docs/ARCHITECTURE.md` follows matklad's ARCHITECTURE.md: a bird's eye view, a codemap naming files without linking them, the invariants and the cross-cutting concerns, as the code is now. matklad revisits his a few times a year. This one is updated in each step's docs round instead, because every session loads it, so a stale line would mislead at once.
- `CLAUDE.md` imports `PROGRESS.md` and `ARCHITECTURE.md`, and no longer imports the log. It says to read the current milestone's decisions file at a step's start, and to search the folder before settling something that may already be decided. A fresh session loads about 5k tokens of docs.
- `PROGRESS.md` says where things stand, what's next and what's open, then lists the current milestone's steps and each finished milestone's branches, as Anthropic's post on long-running agents keeps a short progress file beside the git log as the handover between sessions. The step-by-step story is in the log.
- Each doc has one purpose, as Diátaxis sorts docs into tutorials, how-to guides, reference and explanation: the spec is reference, the plan and the architecture are explanation, and the README keeps its how-to sections (Development, Tasks, Releasing). The spec's Deployment section dropped the pull request rule and the repo's rename, which the plan and the log hold.
- Milestone 4's step list stays out of `PLAN.md`, which keeps each milestone's scope. The steps are in `PROGRESS.md` and their reasons in this file, and a third copy would only drift. The spec's shared-tabs rule came in now, rather than in step 1, because the spec is the source of truth and the decision was already made.
- Files by topic, such as testing and UI, were rejected, because entries span topics and every file would keep growing. Files by month were rejected, because the first three days would all land in one. One file per decision stays rejected, as on 2026-11-09. Importing the index into `CLAUDE.md` was rejected, because its topic lists grow too, and `CLAUDE.md` already says where to look.
- The layout became a global rule for new projects, `~/.claude/rules/project-docs.md`, at the user's choice. Existing projects, such as the weight tracker, keep theirs unless the user asks.
