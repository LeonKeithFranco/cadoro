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

## Before step 1: the check commands (`docs/check-commands`), 2026-11-19

### The workflow against agentic engineering guides

- The user asked how the workflow compares with established practice for agentic engineering. Claude read Anthropic's Claude Code best practices and Simon Willison's Agentic Engineering Patterns in full. The spec first, plan mode before each step, checks Claude can run, the user's review as code is written, small commits, manual testing with screenshots and devices, and the teaching rounds all match or go further.
- Tests stay written after the code, while Willison recommends red/green TDD, test first. His reason is that a test seen failing is proven able to catch a bug. The bug-fix exception and breaking the code on purpose afterwards give the same proof, so the testing rule stands.
- `CLAUDE.md` gained a Commands section, because Anthropic's guide says the exact test, lint and typecheck commands are often its most useful lines, and it named none. It lists the Taskfile's `check:quick` and `check`, how to run one test file, and the `PORT` workaround for a stale dev server.
- Outside the repo, at the user's choice: never stashing and never merging unasked moved from prose alone into permission rules in `~/.claude/settings.json`, a `deny` for `git stash` and `--autostash` and an `ask` for `gh pr merge` and `task pr:merge`. The guide's reason is that `CLAUDE.md` and rules hold "most of the time, not every time", and a request made in the chat can be lost when the conversation compacts. Project memories that only repeated `CLAUDE.md` or the global rules were removed.

## Step 1: routines in storage (`feat/routine-storage`), 2026-11-19

### The storage interface's first methods

- `CadoroStorage` starts with the two methods step 1 needs: `getRoutines()`, the routines not deleted in custom order, and `addRoutinesIfNone(routines)`, which saves them only while storage holds no routine at all, deleted ones included, and says whether it did.
- Deleted routines count, so a user who deletes both starter routines never sees them come back, as the spec's Starter routines section says.
- Checking and adding are one method, so each backend can make them one step. A `hasRoutines()` and an `addRoutines()` called one after the other were rejected, because two tabs opening at once could both find storage empty.
- Routines go in and come out as copies, as IndexedDB copies everything it saves. The in-memory backend copies with `structuredClone`, so tests against it can't pass by sharing objects with the code they check, and the shared suite checks the copies on both backends.
- Which routines can be picked, and in what order, is the pure `pickableRoutines` in `routine.ts`, which both backends call, rather than a filter and a sort written in each.

### The Dexie backend

- `DexieStorage` keeps the data in a database named `cadoro`, which never changes, since renaming it would leave every user's data behind. A test pins the name. The constructor takes another name, so each test gets a database of its own.
- Schema version 1 keys `routines`, `runs` and `workPeriods` by `id`, and keeps `runInProgress`'s key outside the row (`''`), so the run is saved exactly as the engine has it, under a fixed key. Only `routines` has a TypeScript type so far. The other tables get theirs with their records, in steps 2 and 3.
- `addRoutinesIfNone` counts and adds in one read-write transaction. IndexedDB runs read-write transactions on the same table one after another, even across connections, so two tabs can't both add the starters.
- Dexie is a dev dependency like every other package, since the build bundles it into the static files.

### Testing storage

- The shared suite runs on both backends in the browser project. Vitest's Playwright provider starts a fresh browser profile on every run unless `persistentContext` is set, as its source shows, so a random database name per test is enough to keep tests apart, with no clean-up.
- Two `DexieStorage` objects on one database are two connections, as two tabs have, so a test races them with `Promise.all`. Without the transaction, both added their routines in every run, so the test catches it reliably.
- The schema test reads IndexedDB's own stores through Dexie's `backendDB()`. Dexie reports a key kept outside the row as `''` when it reads a saved database, the same as a row that is its own key, while IndexedDB reports `null`. Reading Dexie's schema was rejected for that reason.

### Loading the routines

- `loadRoutines(storage, now, newId)`, in `src/lib/routine-loading.ts`, creates the starters if storage holds none and reads the routines. The root `+layout.ts` builds the `TimerSession` from them with `DexieStorage`, `Date.now` and `crypto.randomUUID`, in its own `openTimerSession`.
- The plan had one `src/lib` function returning the whole session. Splitting the storage part off keeps it free of Svelte, so its tests run in Node against the in-memory backend, while a function that builds a `TimerSession` would need the browser project for its runes.
- The `load` keeps the session's promise in a module variable, assigned with `??=`, so a `load` running again, such as after `invalidateAll()`, hands back the same session rather than losing the run.
- `TimerSession` still needs at least one routine. Nothing can delete routines until milestone 6, and the spec doesn't yet say what the Timer screen shows when every routine is deleted, so that's left open for milestone 6.
