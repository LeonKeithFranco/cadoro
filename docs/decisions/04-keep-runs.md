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
- **Changed later:** the run in progress isn't saved exactly as the engine has it, but as a stored shape with its moments as UTC strings and without its routine, in [The stored run in progress](#the-stored-run-in-progress).

### Testing storage

- The shared suite runs on both backends in the browser project. Vitest's Playwright provider starts a fresh browser profile on every run unless `persistentContext` is set, as its source shows, so a random database name per test is enough to keep tests apart, with no clean-up.
- Two `DexieStorage` objects on one database are two connections, as two tabs have, so a test races them with `Promise.all`. Without the transaction, both added their routines in every run, so the test catches it reliably.
- The schema test reads IndexedDB's own stores through Dexie's `backendDB()`. Dexie reports a key kept outside the row as `''` when it reads a saved database, the same as a row that is its own key, while IndexedDB reports `null`. Reading Dexie's schema was rejected for that reason.

### Loading the routines

- `loadRoutines(storage, now, newId)`, in `src/lib/routine-loading.ts`, creates the starters if storage holds none and reads the routines. The root `+layout.ts` builds the `TimerSession` from them with `DexieStorage`, `Date.now` and `crypto.randomUUID`, in its own `openTimerSession`.
- The plan had one `src/lib` function returning the whole session. Splitting the storage part off keeps it free of Svelte, so its tests run in Node against the in-memory backend, while a function that builds a `TimerSession` would need the browser project for its runes.
- The `load` keeps the session's promise in a module variable, assigned with `??=`, so a `load` running again, such as after `invalidateAll()`, hands back the same session rather than losing the run.
- `TimerSession` still needs at least one routine. Nothing can delete routines until milestone 6, and the spec doesn't yet say what the Timer screen shows when every routine is deleted, so that's left open for milestone 6.

## Step 2: record runs (`feat/run-records`), 2026-11-19

### The records each press saves

- The run engine is unchanged. `recordPress`, in `src/lib/run-records.ts`, compares the run before and after a button press and works out what to save: a new `Run` when Play starts a ready run, a `WorkPeriod` for each period newly in `endedPeriods`, and the run's end when it reaches `ended`. Pause, resuming and moving on from a break save nothing, since breaks aren't recorded.
- The new periods are those past the old count, `endedPeriods.slice(before.length)`, because the engine only ever adds to the end of the list.
- Adding ids, or a list of events, to the engine's runs was rejected. Ids belong to storage, and the engine stays pure timing logic whose runs step 3 saves as they are.
- `roundsReached` is 0 while a run is in progress and set when it ends, from `summarizeRun`, since only then is it known. `endedAt: null` already marks a run in progress. Updating it every round was rejected as extra writes for a number only the end settles. The spec's data model says so.
- Ids come in as `newId`, as `loadRoutines` takes them, so tests use `numberedIds()`. `recordPress` throws if work ends while the caller has no run record, since dropping the work silently would be worse.
- Moments become UTC strings through `toUtcTimestamp` in `time.ts`, as planned in this milestone's storage entry.

### Saving runs and work periods together

- `CadoroStorage.saveRunRecords({ run, workPeriods })` takes what `recordPress` gives and saves it in one read-write transaction across `runs` and `workPeriods`, so a run is never saved as ended without its last work period. The run is `put`, since it's saved at its start and again at its end, and the periods are `bulkAdd`ed, so one is never overwritten.
- Dexie's `bulkAdd` docs say an uncaught failure aborts the transaction and rolls back every write in it, while outside a transaction the other rows stay saved. A test saves an ended run with a repeated work period id and checks that nothing changed. With the transaction removed, it failed on `DexieStorage`.
- The in-memory backend has no transactions, so it checks every id before writing anything.
- Separate `addRun`, `addWorkPeriod` and `endRun` methods were rejected, because a finite routine's last Next would need two calls with nothing holding them together.
- `getRuns()` and `getWorkPeriods()`, oldest first, came now, although the app reads them only from milestone 7, so the shared suite checks what was saved through the interface rather than around it. Their order is the pure `runsOldestFirst` and `workPeriodsOldestFirst`, which both backends call, comparing `Date.parse` values rather than strings.
- `hasWorkPeriods()` counts with Dexie's `count()`, for the persistence check at startup, rather than reading every period.
- **Changed later:** `saveRunRecords` became `saveRunInProgress(runInProgress, records?)`, which saves the run in progress in the same transaction, in [Saving the run in progress](#saving-the-run-in-progress).
- The test helpers `runWith` and `workPeriodWith` copy deeply before spreading, since a spread alone would share a period's `segments` with the constant every test uses.

### The session saving each press

- `TimerSession`'s constructor takes an options object, `{ clock, storage, newId, onWorkSaved }`, typed as `TimerSessionOptions`, so each argument is named at the call. Positional parameters were rejected as easy to swap.
- The buttons stay synchronous and the screen changes at once. Each press's records go on a promise chain, `#saving`, so each save starts once the one before has finished. Saves then reach storage in the order the buttons were pressed whatever the backend, and a run's start can't land after its end. A test holds the first save open with `Promise.withResolvers()`. Without the chain, the start overwrote the ended run.
- Making the buttons `async` and awaiting each save was rejected, since a slow disk would hold up the timer. Relying on IndexedDB running overlapping transactions in order was rejected, since the interface doesn't promise it and the in-memory backend doesn't share it.
- A failed save is logged with `console.error` and the chain carries on, until milestone 8's activity log records errors.
- There's no Playwright journey this step, because nothing on screen changes. The session's tests run the real engine against `InMemoryStorage`, the shared suite proves Dexie behaves the same, and step 3's reload journey checks the saved periods end to end.

### Asking for persistent storage

- `askToPersistOnce(navigator.storage)`, in `src/lib/storage/persistence.ts`, makes a function that asks the first time it's called and does nothing after that. It checks `persisted()` first and calls `persist()` only when storage isn't persistent yet. Its flag is set before the first `await`, so two calls in a row ask once.
- The layout makes one, calls it at startup through `askToPersistIfWorkSaved` when a work period is saved, without waiting, and hands it to the session as `onWorkSaved`, which the session calls after a save that held work periods. So the app asks at most once per launch, never on an empty first visit, as the spec says.
- Asking after every saved work period was rejected, because Firefox shows a prompt each time. Remembering across launches that it had asked was rejected, because the spec asks again at startup while storage isn't persistent.
- Neither function rejects. A browser error or unreadable storage is logged, since the app works the same with or without persistence. TypeScript's DOM types say `navigator.storage` is always there, but it's missing outside HTTPS and `localhost`, so the parameter allows `undefined`.
- Checked in Chromium on the dev server, with `persist()` wrapped to count calls: none on the first visit, one after a run of Play, Next and Finish, and one at startup after a reload. IndexedDB held the run and its work period, with exact times.

## Step 3: keep the run in progress (`feat/restore-run`), 2026-11-19

### The stored run in progress

- The run in progress is saved as `StoredRunInProgress`, in `src/lib/run-in-progress.ts`: the run's `Run` record, so a restored run ends on the record Play started; the engine's run as `StoredRunState`, one shape per started state; and `heartbeatAt`, the moment of the last save. Pure functions convert both ways, `toStoredRunInProgress` and `restoreRunInProgress`, reusing `storedSegment` and its new reverse `segmentFromStored` from `run-records.ts`, and `fromUtcTimestamp` from `time.ts`.
- Every moment in it is a UTC ISO string, at the user's choice, as this milestone's storage entry says. Saving the engine's milliseconds, as step 1's Dexie entry put it, was rejected, because storage would then mix two formats, and DevTools and milestone 8's backups would show raw numbers.
- The routine isn't saved with the run. The session's run uses the routine object itself as its plan, so saving it would copy the whole routine into the row every second. Restoring looks the routine up by the record's `routineId`, which is safe because a routine can't be edited while it runs. A row whose routine is gone is forgotten, and the app starts as usual. That can't happen until milestone 6 adds deleting.
- A ready run is never saved, since nothing worth keeping has happened. The type `StartedRun`, `Exclude<RunState, ReadyRun>`, makes that a type error.
- Dexie keeps the row under the fixed key `current`, which never changes, like the database's name. Schema version 1 already declares the table, and every deployed database has it, empty, so no new version was needed. From 0.5.0 on, the row's shape is saved data, so changing it takes a version 2 with an upgrade.

### Restoring paused at the heartbeat

- `restoreRunInProgress` applies the engine's own `pause` at the heartbeat, since the app may have stopped at any moment after it. A running work period ends its stretch there, and a running break keeps the time it had left. A paused run, a break that was already over and an ended run come back as they were, since `pause` leaves them alone. So restoring has no rules of its own. Without the `pause`, the two tests for running timers failed.
- `TimerSession` takes the row as its constructor's third argument, `saved`, apart from the options object. The options are what the session works with (clock, storage, ids), while the row is data about this launch. The root layout reads it with the routines in one `Promise.all`, before the first render.
- The restored run is saved again at once, paused, so storage shows what the screen does, which step 4's other tabs will follow.
- An ended run stays saved as the run in progress until Done, so its summary comes back after a reload, as the spec now says. Done forgets the row, and its run and work periods stay.

### Saving the run in progress

- `saveRunRecords(records)` became `saveRunInProgress(runInProgress, records?)`, with `getRunInProgress()` and `clearRunInProgress()` beside it. A press saves the row with its run and work periods in one read-write transaction over the three tables. Saved apart, a failure between them would leave them disagreeing: with the records saved and not the row, a restored run would end its work period again under a new id and count the work twice; with the row saved and not the records, the work would be lost. Moving the row's `put` outside the transaction made the rollback test fail on Dexie.
- A heartbeat is the same call without records. Giving `saveRunRecords` a second argument for the row was rejected, as a heartbeat would then save "records" of nothing. Separate methods for the row and the records were rejected, as they couldn't share a transaction.
- A press that changes nothing, such as Pause on a paused run, saves nothing, since the engine returns the same run.
- Every write goes through one queue, `#enqueue`, which the save and Done's clear both use. Sent straight to storage, the clear finished before Finish's save, which brought the forgotten run back, and three tests failed.
- `tick()` saves a heartbeat only while a timer is counting. A paused run has nothing new to save, and a break that's over restores as over anyway. A press reads the clock through `#moveOn()`, so it saves once, not once as a heartbeat as well.

### Hidden pages and background tabs

- The Timer screen saves a heartbeat when `visibilitychange` turns the page hidden and on `pagehide`, through `<svelte:document>` and `<svelte:window>`, so the moment a restored run pauses at is the moment the user left. `unload` was rejected, as it's unreliable, especially on phones, and MDN advises against it. Elsewhere in the app, the run is already paused, which saved it.
- Chrome's [intensive throttling](https://developer.chrome.com/blog/timer-throttling-in-chrome-88) runs a chain of timers, such as a `setInterval`, at most once a minute once a page has been hidden for more than 5 minutes. So heartbeats in a long-hidden tab come about once a minute, and if the phone stops the app then, up to a minute of work may not count. The timer stays exact meanwhile, since its times come from timestamps. This is accepted, since the hidden page's own heartbeat covers the usual case of leaving and coming back.

### The reload journey

- `e2e/restore.spec.ts` reloads mid-work, mid-break and with the summary open, on the `desktop` and `phone` projects, and checks the times exactly. `e2e/storage.ts` reads the `workPeriods` table from inside the page with IndexedDB's own API, so the journey checks the restored work period is saved once, with both its stretches. Ignoring the saved run in the layout made it fail at its first check.
- Playwright's clock keeps its fake time across `page.reload()`: its source adds each clock call as an init script that logs it with the real time, and each new document replays the log.

## Between steps 3 and 4: the autonomous replan (`build/agent-guardrails`), 2026-11-19

### The decisions

- Scope: the full spec to 1.0.0, nothing cut. Web Push and the container and homelab stay optional, outside the run.
- Shared tabs are built as planned, with a Dexie live query.
- Order: shared tabs, Alerts and Settings, Routines, Stats, Backup and activity log, then 1.0.
- One pull request per milestone, each with one version bump and release, and one fresh Opus reviewer per milestone before the merge prompt.
- Claude runs `task pr:merge` once CI is green and the review is settled. The existing `ask` rule stays, so the user's approval of the prompt is the sign-off.
- Teaching stopped entirely: no explanations, no learning log entries, no stops for questions. `docs/PLAN.md` is the approved plan for every remaining milestone, so there's no plan mode per step.
- Docs are lean: SPEC, PROGRESS and ARCHITECTURE updated once per milestone, and short decision-log bullets only for what the spec and plan don't hold.
- Quality: good documentation and good tests, always. Doc comments stay enforced, and every rule, edge case, journey and failure gets a test.
- Design is Claude's call, following the existing screens, and the user sends feedback after using the app.
- Chimes: open-licensed files if their licences can be verified, otherwise synthesised with Web Audio.
- The only remaining routine can't be deleted: Delete is disabled, with a hint. This settles the open item about deleting every routine.
- One continuous session through all milestones. Open questions get the conventional option that fits the spec, noted. Device checks are listed in each release summary, never waited on.
- The README is practical only: what it is, install, use, data limitations, self-hosting and development.
- Guardrails come first, so the run is checked mechanically: test-integrity lint, return types and typed promise lint, `noUncheckedIndexedAccess`, and a permission prompt on guardrail edits.
- The packages the remaining milestones need are installed in one command, so the install prompt comes once, while the user is present. Any other package still prompts.

### Milestone 0: the guardrails

- Installed `@vitest/eslint-plugin`, `eslint-plugin-playwright`, `date-fns`, `layerchart` 2.11 and `svelte-dnd-action` in one command. All fit Svelte 5.57, TypeScript 6 and Vite 8, so none was replaced. They're dev dependencies, like Dexie, so `npm audit --omit=dev` leaves them out.
- Explicit return types, with 19 fixes.
- typescript-eslint's typed rules, with the promise rules on. `require-await` is off, because `InMemoryStorage` and the test fakes implement promise interfaces with `async` methods that don't await, while `no-floating-promises` still catches a forgotten await. `tsconfig.json` now includes `dev-server.test.ts` and `pwa-assets.config.ts`, so the typed rules cover them.
- The Vitest and Playwright lint plugins check the tests. Inline ESLint configuration is ignored (`noInlineConfig`, which ESLint reports as a warning while the rule it tried to disable still errors), and `@ts-expect-error` is banned.
- `noUncheckedIndexedAccess` is on. `requireDefined` in `src/lib/defined.ts` and `blockAt` in `run.ts` cover indexes that must exist, rather than a blanket `!`.
- `.claude/settings.json` asks before Edit on `eslint.config.js`, `tsconfig.json`, `playwright.config.ts`, `.github/workflows/**` and itself. Claude Code didn't apply it to the first edit right after the file was written, only to later edits, so a new rule should be proven with a second edit.
