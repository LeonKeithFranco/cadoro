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
