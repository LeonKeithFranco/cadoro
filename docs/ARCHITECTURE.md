# Architecture

How Cadoro's code fits together now: where each thing lives, the rules the code keeps, and the concerns that cut across it. The reasons are in `docs/decisions/`, and the details are in each file's doc comments. Update this file when a step changes what it describes.

## Bird's eye view

Cadoro is a static SvelteKit single-page app. GitHub Pages, or any web server, serves the same built files to everyone, and everything happens in the browser.

The code is in layers, each knowing only the one below it:

1. **The run engine** in `src/lib` is plain TypeScript: a run is an immutable value, and every button is a pure function from one run and the current moment to the next run. It never reads the clock or touches the page.
2. **Storage**, in `src/lib/storage`, is the `CadoroStorage` interface, kept in the browser's IndexedDB through Dexie. It holds the routines, every run and work period, and the run in progress.
3. **`TimerSession`** keeps the current run in Svelte state, reads the clock, and applies the engine's functions when a button is pressed or the screen ticks. After each press it works out what to save with the pure `recordPress`, and hands it to storage with the run in progress, which each tick saves again as a heartbeat. It follows the saved run, so a change another tab saves replaces its run without being saved again. When the app opens with no other tab open, it restores the saved run, paused at its last heartbeat, and with another tab open it joins the run live.
4. **Components** show views that pure functions work out from the run, such as `viewRun` for the screen and `viewBlock` for each block card, and call the session's methods.
5. **Routes** frame the screens with the header, the navigation and the update prompt. The root layout's `load` reads the routines and the run in progress from storage, creating the starter routines on the first launch, and starts the app's one `TimerSession` before anything renders.

Every tab has its own session, and all of them follow the one saved run. Storage tells each tab when another tab changes the run, and a press that a tab makes from an out-of-date run is refused, so the tab takes the saved run instead.

## Codemap

### `src/lib`: the logic

- `run.ts`: the run engine. The `RunState` union (ready, working, break, ended), the buttons (`play`, `pause`, `next`, `finish`), moving through rounds, blocks and cycles (`nextPosition`), the position label, work time from segments (`workedMs`), the earned break (`earnedBreakMs`), the view the timer screen shows (`viewRun`) and the run summary (`summarizeRun`).
- `run-records.ts`: the `Run` and `WorkPeriod` records from the spec's data model, `recordPress`, which compares a run before and after a press to work out what to save, `noRecords` for a change that keeps nothing new, the segment conversions `storedSegment` and `segmentFromStored`, and the oldest-first orders `runsOldestFirst` and `workPeriodsOldestFirst`.
- `run-in-progress.ts`: `StoredRunInProgress`, the run in progress as storage keeps it (its record, the run without its routine, and `heartbeatAt`), with every moment as a UTC string and a `revision` that every change renews; `toStoredRunInProgress`; `followRunInProgress`, which takes a run another tab saved on as it is; `restoreRunInProgress`, which finds the run's routine and pauses the run at its heartbeat with the engine's `pause`; and `isRevision` and `withHeartbeat`, the checks and the heartbeat-only change that storage applies.
- `open-tabs.ts`: `joinOpenTabs`, which asks the browser's Web Locks API whether another tab holds the lock `cadoro-open-tab`, then takes it for this tab until it closes.
- `defined.ts`: `requireDefined`, which returns a value that must exist and throws when it's `undefined`, for indexes `noUncheckedIndexedAccess` can't prove. `run.ts` also has `blockAt` for a position's block.
- `block-view.ts`: `viewBlock`, what each block card shows, worked out from the run's view.
- `routine.ts`: the `Routine` and `Block` types from the spec's data model, `pickableRoutines` (those not deleted, in custom order) and `createStarterRoutines`.
- `routine-loading.ts`: `loadRoutines`, which creates the starter routines when storage holds none, then reads the routines.
- `time.ts`: unit conversions (`MS_PER_SECOND`, `minutesToMs`), `toUtcTimestamp` and `fromUtcTimestamp` for moments saved in storage, and time formatting (`formatElapsed` rounds down, `formatRemaining` rounds up).
- `percent.ts`: `percentOf` and `asPercentOf`, multiplying before dividing.
- `screens.ts`: `isCurrentScreen`, which link in the navigation is the current one.
- `timer.svelte.ts`: `TimerSession`, built from the routines, `TimerSessionOptions` (`clock`, `storage`, `newId`, `newRevision`, `onWorkSaved`) and how the app opened (`saved`, `isAnotherTabOpen`), which decides whether it restores the saved run or joins it live. The root layout makes the app's one session.
- `page-reload.ts`: `reloadPage`, alone in its module so tests can replace it.

### `src/lib/storage`: where data is kept

- `storage.ts`: the `CadoroStorage` interface, the only way the app reads and saves data. It reads the routines and adds them on the first launch, saves the run in progress with a change's run and work periods together, only if the stored revision is the one the change was made from (`saveRunInProgress`), saves a heartbeat alone (`saveHeartbeat`), reads the run in progress back (`getRunInProgress`), calls back whenever it changes, in any tab (`watchRunInProgress`), forgets it (`clearRunInProgress`), reads the runs and work periods back oldest first, and says whether any work period is saved.
- `dexie-storage.ts`: `DexieStorage`, the app's backend, in the IndexedDB database `cadoro`, with schema version 1 declaring `routines`, `runs`, `workPeriods` and `runInProgress`, and version 2 adding a revision to the saved run. The run in progress is one row under the key `current`, and Dexie's live query tells every tab when it changes.
- `in-memory-storage.ts`: `InMemoryStorage`, for tests of code that uses storage, with plain subscribers for the watch.
- `persistence.ts`: `askToPersistOnce`, which asks the browser for persistent storage at most once, and `askToPersistIfWorkSaved`, the check at startup.

### `src/lib/components`: the Svelte components

- `TimerScreen` lays out the Timer screen: `RoutinePicker`, a `BlockCard` per block, `TimerControls`, and the `FinishConfirmation` and `RunSummary` dialogs, both built on `ModalDialog`. It runs the one-second tick, ticks again as the page is hidden or closed (`<svelte:document>`, `<svelte:window>`), and pauses the run when it's removed.
- `ScreenNav` is the navigation, `ScreenHeading` gives each screen its heading and tab title, and `ScreenPlaceholder` stands in for the screens not built yet.
- `UpdatePrompt` registers the service worker and offers to reload when a new version is waiting.
- `button-colours.ts` holds the main and outlined buttons' Tailwind classes, which every screen and dialog shares.

### `src/routes`: the screens

- `+layout.ts` turns off server-side rendering, so the app renders only in the browser, and its `load` opens storage, reads the routines and the run in progress, and returns `{ timerSession }` as the layout's `data`, which every page receives. It also starts the check for persistent storage, without waiting for it.
- `+layout.svelte` is the frame: the global styles from `layout.css`, the header, the navigation and `UpdatePrompt`.
- `+page.svelte` is the Timer screen, showing the session from `data`. `routines/`, `stats/` and `settings/` hold the other screens. Settings shows the app's version.

### Tests and their helpers

- Unit tests sit beside their module as `*.test.ts`, component tests beside their component as `*.svelte.test.ts`, and storage tests beside their backend as `*.browser.test.ts`.
- `storage.browser.test.ts` is the suite every backend shares, and `dexie-storage.browser.test.ts` covers what only IndexedDB has: data kept after reopening, two connections at once, the saved schema and the database's name.
- `src/lib/testing/` holds test helpers: `durations.ts` (`seconds`, `minutes`, `hours`), `ids.ts` (`numberedIds`), `routines.ts` (`oneRoundRoutine`, `routineWith`), `run-records.ts` (`runInProgress`, `firstWorkPeriod`, `runWith`, `workPeriodWith`), `run-in-progress.ts` (`savedRunInProgress`, `runInProgressWith`) and `run-summary.ts` (`shownTotals`).
- `e2e/` holds the Playwright journeys (`*.spec.ts`), with `clock.ts` (`openOnPausedClock`, `followLink`), `storage.ts` (`savedWorkPeriods`, read from the page's IndexedDB; `shared-run.spec.ts` runs two tabs of one browser context, which share one fake clock), `service-worker.ts` (`waitForActiveWorker`), and `update-server.ts`, which serves the production build with a new service worker to browsers that ask. `e2e/production/` holds the journeys against the production build.

### Config and tooling

- `vite.config.ts`: SvelteKit's config inside `withPwa`, with the base path from `BASE_PATH`, the PWA plugin's service worker and manifest, `__APP_VERSION__` from `package.json`, and Vitest's two test projects.
- `dev-server.ts`: the dev server's port from `PORT`, shared by Vite and Playwright.
- `playwright.config.ts`: the four Playwright projects and the three servers they test.
- `eslint.config.js`: the lint rules, including the doc comment checks. `prettier.config.js` formats every file.
- `pwa-assets.config.ts` and `static/`: the icons, made from `static/favicon.svg` by `npm run generate-icons`.
- `Taskfile.yml`: go-task tasks for the workflows that take several commands. The README lists them.
- `.github/workflows/pipeline.yml`: CI's `Checks` job, then the Pages build and deploy on `main`.

## Invariants

- Time comes from saved timestamps, never from counting ticks. The engine takes `now` as an argument, and the session takes its clock as a parameter, so tests control time exactly.
- The engine's runs are immutable. Each button returns a new run or the same one, and a button that does nothing in the current state returns the run unchanged rather than throwing.
- Nothing in the engine or the view functions reads the clock, the page or Svelte. Svelte appears only in `.svelte` and `.svelte.ts` files.
- Work time is kept to the millisecond. Only the earned break is rounded, once, to whole seconds, when the break starts.
- Every link and asset address goes through SvelteKit's `resolve()` or `%sveltekit.assets%`, so the app works under a base path such as `/cadoro`.
- Data goes only through `CadoroStorage`. Nothing else opens IndexedDB.
- A change's run in progress, run and work periods are saved together or not at all, so a run is never saved as ended without its last work period, and a restored run never ends a work period that's already saved. Writes reach storage in the order they were made, so a late heartbeat can't bring back a run that Done forgot.
- A press is saved only if the stored run is still the one it was made from: every change gets a unique revision, and the save checks it in the same transaction. A tab that's refused takes the stored run, and keeps nothing of its own.
- A heartbeat writes only the time, never a whole run, so a stale tab's heartbeat can't undo another tab's press.
- Work is recorded by the tab that pressed, and only when its save is accepted, so each work period and run is saved once however many tabs are open. A tab that follows a change never saves it.
- A restored run comes back paused at its last heartbeat, so time after it never counts as work. A tab that opens while another tab is open joins the run live and doesn't pause it. A ready run is never saved.
- What's stored survives upgrades: schema versions 1 and 2 never change now that they're deployed, so a change to what's stored takes a new Dexie version with an upgrade, and a test for it.

## Cross-cutting concerns

### State in Svelte

- `TimerSession` keeps its fields in JavaScript's `#private` fields, so only its methods can change the run.
- The run is held in `$state.raw`, because the engine replaces it whole. The view is `$derived` from the run and the last tick's moment.
- An effect that should restart only when something changes reads a `$derived` of that thing, such as `isRunning`, not a value that changes on every tick.
- State about a screen rather than the run, such as whether Finish is asking, is the screen's own `$state`.

### Saving

- The buttons stay synchronous, and the screen changes at once. `TimerSession` puts every write, saves and Done's clear alike, on one promise chain (`#enqueue`), so each starts once the one before has finished, and doesn't wait for it.
- Each tab holds a shared Web Lock for as long as it's open, which the browser lets go when the tab closes or crashes. A tab opening checks for it before taking its own, since a heartbeat's age can't say whether another tab is alive.
- Leaving the Timer screen pauses the run, which is a press, so it pauses the run in every tab.
- The run in progress is saved on every press that changes the run, on each tick while a timer counts, and as the page is hidden or closed. In a tab hidden for over 5 minutes, Chrome runs the tick about once a minute, so heartbeats come less often there.
- A failed save, or a failed request for persistent storage, is logged with `console.error`, and the app carries on. Milestone 8's activity log records errors.
- Persistent storage is asked for at most once per launch: at startup when work is saved, or else after the first work period is saved.

### Styling and themes

- Tailwind classes only, with `@tailwindcss/forms` styling native controls. Native elements cover every widget, such as `<dialog>` and `<select>`.
- The `dark:` variant follows `data-theme` on `<html>`, fixed to `dark` until Settings can change it. Every element carries both its light and its dark colours.
- Rose is the accent and amber means overtime, and colour never carries meaning alone. Text keeps at least 5:1 contrast, and outlines and bars at least 3:1, in both themes.
- The layout is one centred column up to `max-w-3xl`, with a bottom tab bar on phones and header links from `md` (48rem).

### Testing

- Vitest's `server` project runs `*.test.ts` in Node, and its `client` project runs `*.svelte.test.ts` and `*.browser.test.ts` in Chromium through browser mode, where storage tests use the real IndexedDB, with a new database per test.
- Component tests find elements by role and label. The timer's tests drive the session with a fake clock and fake only `setInterval` and `clearInterval`, and the update prompt's replace the PWA plugin's module with `vi.mock`.
- The session's tests give it `InMemoryStorage` and read what was saved with `expect.poll`, since saves finish after the press. The persistence tests use a fake `StorageManager`, since the real one's answer depends on the browser's own judgement.
- Tests write times as `minutes(25)`, not `25 * 60_000`, and keep their data visible rather than importing it from the code they check.
- Playwright's projects are `desktop` and `phone` against the dev server (`PORT`, 5173 by default), `production` against a build at `/cadoro` on port 4175, and `updates` against the update server on port 4176.
- Journeys that run the timer start on a paused fake clock with `openOnPausedClock`, move it with `fastForward`, and follow links with `followLink`, since SvelteKit waits on a timer before navigating. The fake clock carries on across `page.reload()`, so the reload journey checks exact times.
- The Timer screen's tests fake a hidden page by replacing `document.visibilityState`'s getter and sending `visibilitychange` themselves.

### Docs and lint

- Every module-level declaration, type, field and prop has a TSDoc comment, checked by ESLint with `eslint-plugin-tsdoc` and `eslint-plugin-jsdoc`. Each component starts with a `<!-- @component -->` comment. Variables made with `$state`, `$derived` or `$props` are exempt.
- `npm run typecheck` fails on any Svelte warning.
- Signatures need explicit return types. typescript-eslint's typed rules are on, with `no-floating-promises`, `no-misused-promises` and `await-thenable` among them, and `require-await` off because promise-interface fakes have `async` methods that don't await.
- `noUncheckedIndexedAccess` is on, so an index that must exist goes through `blockAt` or `requireDefined`, never a bare `!`.
- Tests are linted with `@vitest/eslint-plugin` and `eslint-plugin-playwright`: no skipped or focused tests, every test asserts, and Playwright calls are awaited.
- Inline ESLint configuration is ignored (`noInlineConfig`) and `@ts-expect-error` is banned.
- `.claude/settings.json` is checked in. It asks before an edit to `eslint.config.js`, `tsconfig.json`, `playwright.config.ts`, `.github/workflows/**` or itself.

### Builds, deploys and releases

- The build is `adapter-static` with an `index.html` fallback, and nothing is prerendered. Workbox's service worker keeps every file and answers every address with the fallback page, so the app works offline.
- A new version waits until the user reloads, and the prompt stays hidden during a run.
- CI runs the checks on every pull request, in Playwright's container image. A push to `main` that passes deploys to GitHub Pages, with a copy of the fallback page as `404.html`.
- Releases follow the README's Releasing section: `task release:bump` on the pull request, then `ci:watch-main`, `pages:check` and `release:publish` after the merge.
