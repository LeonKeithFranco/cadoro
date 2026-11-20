# Architecture

How Cadoro's code fits together now: where each thing lives, the rules the code keeps, and the concerns that cut across it. The reasons are in `docs/decisions/`, and the details are in each file's doc comments. Update this file when a step changes what it describes.

## Bird's eye view

Cadoro is a static SvelteKit single-page app. GitHub Pages, or any web server, serves the same built files to everyone, and everything happens in the browser.

The code is in layers, each knowing only the one below it:

1. **The run engine** in `src/lib` is plain TypeScript: a run is an immutable value, and every button is a pure function from one run and the current moment to the next run. It never reads the clock or touches the page.
2. **Storage**, in `src/lib/storage`, is the `CadoroStorage` interface, kept in the browser's IndexedDB through Dexie. It holds the routines, every run and work period, the run in progress, the settings, and the activity log. Every change to a routine and every import is written to the log there, and errors are added to it through `addLogEntry`.
3. **`TimerSession`** keeps the current run in Svelte state, reads the clock, and applies the engine's functions when a button is pressed or the screen ticks. After each press it works out what to save with the pure `recordPress`, and hands it to storage with the run in progress, which each tick saves again as a heartbeat. It follows the saved run, so a change another tab saves replaces its run without being saved again, and it follows the routines, so an edit, deletion or reorder in any tab reaches its picker. When the app opens with no other tab open, it restores the saved run, paused at its last heartbeat, and with another tab open it joins the run live.
4. **Components** show views that pure functions work out from the run, such as `viewRun` for the screen and `viewBlock` for each block card, and call the session's methods.
5. **Routes** frame the screens with the header, the navigation, the update prompt and `ThemeSync`. The root layout's `load` reads the routines, the settings and the run in progress from storage, creating the starter routines on the first launch, and starts the app's one `TimerSession`, `SettingsSession`, `RunChimes` and `WakeLockKeeper` before anything renders.

Every tab has its own sessions, and all of them follow the one saved run and the saved settings. Storage tells each tab when another tab changes either, and a press that a tab makes from an out-of-date run is refused, so the tab takes the saved run instead.

Beside the timer, `RunChimes` and `WakeLockKeeper` watch the session's run and the settings, and act on the browser: the first schedules chimes on the audio clock, the second keeps the screen on. Neither changes the run. `RunChimes.destroy` stops its effects, listener and check timer; the app never calls it, since the chimes last as long as the page, but each test that opens a tab does.

## Codemap

### `src/lib`: the logic

- `run.ts`: the run engine. The `RunState` union (ready, working, break, ended), the buttons (`play`, `pause`, `next`, `finish`), moving through rounds, blocks and cycles (`nextPosition`), the position label, work time from segments (`workedMs`), the earned break (`earnedBreakMs`), the view the timer screen shows (`viewRun`) and the run summary (`summarizeRun`).
- `run-records.ts`: the `Run` and `WorkPeriod` records from the spec's data model, `recordPress`, which compares a run before and after a press to work out what to save, `noRecords` for a change that keeps nothing new, the segment conversions `storedSegment` and `segmentFromStored`, and the oldest-first orders `runsOldestFirst` and `workPeriodsOldestFirst`.
- `run-in-progress.ts`: `StoredRunInProgress`, the run in progress as storage keeps it (its record, the run without its routine, and `heartbeatAt`), with every moment as a UTC string and a `revision` that every change renews; `toStoredRunInProgress`; `followRunInProgress`, which takes a run another tab saved on as it is; `restoreRunInProgress`, which finds the run's routine and pauses the run at its heartbeat with the engine's `pause`; and `isRevision` and `withHeartbeat`, the checks and the heartbeat-only change that storage applies.
- `open-tabs.ts`: `joinOpenTabs`, which asks the browser's Web Locks API whether another tab holds the lock `cadoro-open-tab`, then takes it for this tab until it closes.
- `defined.ts`: `requireDefined`, which returns a value that must exist and throws when it's `undefined`, for indexes `noUncheckedIndexedAccess` can't prove. `run.ts` also has `blockAt` for a position's block.
- `block-view.ts`: `viewBlock`, what each block card shows, worked out from the run's view.
- `routine.ts`: the `Routine` and `Block` types from the spec's data model, `pickableRoutines` (those not deleted, in custom order), `createStarterRoutines`, `newBlock` and `newRoutine` (the defaults a new block and a new routine start with), and `canDeleteRoutine`, which is false for the last routine.
- `routine-limits.ts`: the data model's limits as named constants, such as `TITLE_MAX_LENGTH` and `BLOCKS_MAX`.
- `routine-validation.ts`: `validateRoutine`, which checks a routine and its blocks against those limits, trimming titles first, and says what's wrong with each field (`RoutineProblems`, `BlockProblems`), and `isValid`. A routine's only block must have 1 cycle.
- `routine-sort.ts`: `sortRoutines`, the seven `RoutineSort` orders, with `RoutineUsage` (the runs and work periods that last used and most work are worked out from). Routines that tie fall back to custom order.
- `routine-usage.svelte.ts`: `RoutineUsageKeeper`, which holds the `RoutineUsage` and reads it again with `reload()`. The root layout makes one, and the session's `pickerOrder` and the Timer's picker both sort with it, so the fallback routine is the picker's first. The Timer page reloads it as it opens, and the session as a run starts or work is saved.
- `list-order.ts`: `moveToIndex`, `moveUp` and `moveDown` for any list of items with an `id`.
- `routine-order.ts`: the same moves for routines, with `renumberRoutines` and `insertRoutine`, which renumber the routines they're given as 0 to n-1. A delete leaves a gap until the next create, duplicate or reorder, so code that places a routine uses its index among the routines not deleted, never its `customPosition`.
- `routine-blocks.ts`: `addBlock`, `duplicateBlock`, `deleteBlock`, `moveBlockUp`, `moveBlockDown`, `moveBlockToIndex`, `canAddBlock`, `canDeleteBlock` and `resetSingleBlockCycles`.
- `routine-break-preview.ts`: `breakAtTargetMs`, the break earned at a block's target, which reuses `earnedBreakMs` so it rounds as a real break does, and `describeBreakAtTarget`, the hint's text in the break timer's format. Both give nothing for an invalid target or percentage. Pure.
- `routine-duplication.ts`: `duplicateRoutine` and `copyTitle`, which makes the copy's title and cuts the original's to fit 50 characters with the suffix.
- `routine-changes.ts`: `planCreate`, `planDuplicate`, `planSave`, `planDelete` and `planReorder`, which work out from the saved routines a `RoutineChange`: the routines to write and the log entry that describes the change. `planSave` and `planDelete` also take the id of the routine of the run in progress and refuse it. Both backends apply them, so the rules live once.
- `log.ts`: `LogEntry`, `NewLogEntry`, `LOG_MAX_ENTRIES` (5,000) and `withRepeatCounted`, which both backends' `addLogEntry` use to count an error that repeats the newest entry, within `ERROR_REPEAT_WINDOW_MS`, in that entry (`details.count`, `details.lastTimestamp`) instead of adding one.
- `csv-export.ts`: `workPeriodsToCsv` and `CSV_COLUMNS`, the CSV of work periods, oldest first, with CRLF line ends and RFC 4180 quoting, and a single quote in front of a title that starts like a formula. Pure.
- `backup-format.ts`: the `Backup` and `BackupData` types, `BACKUP_APP_NAME` and `BACKUP_FORMAT_VERSION`, `createBackup` and `serializeBackup`.
- `backup-parsing.ts`: `parseBackup`, which reads a file's text and checks every part of it, returning the backup or the reason it's invalid, so an invalid file is rejected whole.
- `backup-fields.ts`: the readers `parseBackup` builds on, each returning a value of the right type or throwing an `InvalidBackupError` that names the field's place, such as `routines[0].title`.
- `backup-summary.ts`: `summarizeBackup` and `describeBackupSummary`, what an import's confirmation shows: the counts and the first and last run's days and the export day, in the user's time zone.
- `backup-log.ts`: `importLogEntry`, the log entry for an import, which both storage backends write the same way.
- `export-files.ts`: `exportFileName`, which names a download after what it holds and the local day, and `serializeLog`. `file-download.ts` has `SaveFile` and `downloadTextFile`, which hands the user a file through a link with a `download` name and lets the Blob's address go after a delay, since Firefox and Safari read it after the click.
- `error-log.ts`: `recordError`, which writes an `error` entry to the log chosen with `useErrorLog` and never throws, falling back to `console.error`, and `errorDetails`, which turns anything thrown into the entry's details.
- `global-error-handlers.ts`: `installGlobalErrorHandlers`, which records the `error` and `unhandledrejection` events.
- `routine-loading.ts`: `loadRoutines`, which creates the starter routines when storage holds none, then reads the routines.
- `time.ts`: unit conversions (`MS_PER_SECOND`, `minutesToMs`), `toUtcTimestamp` and `fromUtcTimestamp` for moments saved in storage, and time formatting (`formatElapsed` rounds down, `formatRemaining` rounds up).
- `percent.ts`: `percentOf` and `asPercentOf`, multiplying before dividing.
- `screens.ts`: `isCurrentScreen`, which link in the navigation is the current one.
- `timer.svelte.ts`: `TimerSession`, built from the routines, `TimerSessionOptions` (`clock`, `storage`, `newId`, `newRevision`, `onWorkSaved`, `onRunSaved`, `onPress`, `onRunStarted`) and how the app opened (`saved`, `isAnotherTabOpen`, `lastRoutineId`), which decides whether it restores the saved run or joins it live, and which routine it opens on: the last one used, else the first pickable. It has a `run` getter for the chimes, calls `onPress` from every button, and calls `onRunStarted` with the routine when a run starts. `pauseOnLeave` pauses the run as the Timer screen is left, without calling `onPress`, since no button was pressed. The root layout makes the app's one session.
- `chime-schedule.ts`: `nextChime`, which works out from a run and the current moment the one chime still ahead (`DueChime`: its `ChimeAlert`, `target` or `break`, and its moment), or none. Pure.
- `chime-player.ts`: `ChimePlayer`, which loads the chime files and schedules each chime on the audio clock (`AudioContext.currentTime`), through `ChimeAudioContext`, the parts of `AudioContext` it uses, so tests can fake it. It plays nothing until `unlock()`, which a button press calls and which says whether the audio can play, and `preview` plays a file at once without touching the schedule. The audio clock stops while a laptop sleeps or a phone takes a call, so the player places the last run's chime again from the wall clock (`catchUp`) when the context runs again, after an unlock resumes it, and whenever `RunChimes` asks, leaving a chime still in place alone. A chime whose file loads more than `LATE_CHIME_TOLERANCE_MS` (1 second) after its moment is dropped. `cancel` forgets the run and its chime.
- `chimes.ts`: the chime ids (`CHIME_IDS`), `DEFAULT_CHIME`, their names for Settings (`chimeName`), and the file each id or alert plays (`chimeFile`, `chimeFilesFor`), where an unknown id plays the default. Pure.
- `run-chimes.svelte.ts`: `RunChimes`, which follows the session's run and the settings and has the player reschedule whenever the run or the chosen chime changes, never on a tick. A volume change only sets the gain, which reaches the scheduled chime too. It joins the Web Lock queue `cadoro-chimes` once a press has made the tab's audio play, and gives its turn up when an unlock finds the audio can't resume, so one tab that can play sounds. It has the player catch up as the page shows again, and once a second on an interval of its own, so it runs on every screen, not only the Timer's. Its `preview` is for Settings.
- `wake-lock.svelte.ts`: `WakeLockKeeper`, which asks for the screen wake lock while a timer counts, the page is visible and the setting is on, releases it otherwise, asks again when the browser lets it go by itself while the page is visible, and says whether the browser has the API (`isSupported`).
- `settings.ts`: the `Settings` and `Theme` types from the spec, `DEFAULT_SETTINGS`, `settingsWithChanges`, which keeps only the changed settings, `settingsDifferingFromDefaults`, which does the same for a full set, as an import's, and `settingsFrom`, which fills in the defaults a saved row lacks. Pure.
- `settings.svelte.ts`: `SettingsSession`, the settings as Svelte state that screens read: a change shows at once and is saved, and a change another tab saves is followed.
- `theme.ts`: `resolveTheme`, which turns the theme setting and the device's preference into the light or dark theme to show, and `THEME_COLOURS`, each theme's page background for the browser's bars. Pure.
- `day-slices.ts`: the only place that works out local days, with date-fns. `splitAtMidnight` and `daySlicesOf` split each work period's unpaused segments at every local midnight into `DaySlice`s, and `startOfLocalDay` and `nextLocalDay` step through local days, which are 23 or 25 hours long when daylight saving changes. `nextLocalDay` takes the start of the next date again, since where clocks change at midnight, the change day starts at 01:00, not midnight.
- `work-totals.ts`: adds the slices up per day (`dailyTotals`, a total for every day of a `DayRange`), per Monday-based week (`weeklyTotals`), per calendar month (`monthlyTotals`) and for today (`workedToday`).
- `stats-range.ts`: the daily chart's presets (`RANGE_PRESETS`, `RangePreset`) and `rangeForPreset`, which works out the first and last day, today included.
- `streaks.ts`: `streaksOf`, the current and longest streak in local days, the current one kept alive through today.
- `target-stats.ts`: `timeAgainstTarget` and `targetsReached`, both `null` with no work periods.
- `routine-stats.ts`: `filterByRoutine`, `allTimeTotals` (overall and per routine, deleted routines included) and `routineLabel`, which adds "(deleted)".
- `work-in-progress.ts`: `workInProgress`, which turns the run in progress's current work period into a `WorkPeriod` so far, up to its pause or now, for Stats to count with the saved ones.
- `stats-view.ts`: `viewStats`, which picks the stats modules' numbers for the Stats screen and writes them as text and rows (`StatsView`, `TotalRow`, `DayBar`). The routine filter narrows all of it but `hasWork`.
- `page-reload.ts`: `reloadPage`, alone in its module so tests can replace it.

### `src/lib/storage`: where data is kept

- `storage.ts`: the `CadoroStorage` interface, the only way the app reads and saves data. It reads the settings (`getSettings`), saves changes to them (`saveSettings`) and calls back when they change, in any tab (`watchSettings`). It reads the routines and adds them on the first launch, reads every routine with the deleted ones (`getAllRoutines`), follows the routines not deleted (`watchRoutines`), creates, duplicates, edits, deletes and reorders routines (`createRoutine`, `duplicateRoutine`, `saveRoutine`, `deleteRoutine`, `reorderRoutines`) and reads the log, newest first (`getLogEntries`), and adds an entry to it (`addLogEntry`). It reads everything a backup holds in one read (`readBackupData`) and replaces it all in one transaction (`replaceAllData`), which forgets the run in progress, keeps the log and then logs the import. `StorageOptions` gives a backend its clock and log limit. It saves the run in progress with a change's run and work periods together, only if the stored revision is the one the change was made from (`saveRunInProgress`), saves a heartbeat alone (`saveHeartbeat`), reads the run in progress back (`getRunInProgress`), calls back whenever it changes, in any tab (`watchRunInProgress`), forgets it (`clearRunInProgress`), reads the runs and work periods back oldest first, and says whether any work period is saved.
- `dexie-storage.ts`: `DexieStorage`, the app's backend, in the IndexedDB database `cadoro`, with schema version 1 declaring `routines`, `runs`, `workPeriods` and `runInProgress`, version 2 adding a revision to the saved run, version 3 adding the `settings` table, and version 4 adding the `log` table. The run in progress is one row under the key `current`, and so are the settings, which hold only the fields the user has changed. Dexie's live query tells every tab when either changes. It also writes the theme mirror whenever it saves or reads the settings.
- `in-memory-storage.ts`: `InMemoryStorage`, for tests of code that uses storage, with plain subscribers for the watches.
- `theme-mirror.ts`: `writeThemeMirror` and `THEME_MIRROR_KEY` (`cadoro-theme`), a copy of the theme setting in `localStorage`, which `app.html`'s inline script reads before the first paint. Only `DexieStorage` writes it.
- `persistence.ts`: `askToPersistOnce`, which asks the browser for persistent storage at most once, `askToPersistIfWorkSaved`, the check at startup, and `isStoragePersistent` and `requestPersistentStorage`, which Settings uses to show the status and to ask again.

### `src/lib/components`: the Svelte components

- `TimerScreen` lays out the Timer screen: `RoutinePicker`, a `BlockCard` per block, `TimerControls`, and the `FinishConfirmation` and `RunSummary` dialogs, both built on `ModalDialog`. It runs the one-second tick, ticks again as the page is hidden or closed (`<svelte:document>`, `<svelte:window>`), and pauses the run with `pauseOnLeave` when it's removed.
- `ScreenNav` is the navigation, and `ScreenHeading` gives each screen its heading and tab title.
- `UpdatePrompt` registers the service worker and offers to reload when a new version is waiting.
- `SettingsScreen` is the Settings screen: the theme, a chime picker with a Preview button for each alert, the volume (saved when the slider is released), keep the screen awake (disabled where the browser has no wake lock), the persistent storage status with "Ask again", the Data card, and the version.
- `DataSection` is the Data card: CSV export, JSON backup, import and a link to the log. A chosen file is read and parsed first, and its summary waits in a confirm dialog, in `$state.raw` since a `$state` proxy can't be cloned for IndexedDB, until the user confirms. A rejected file shows its reason and changes nothing.
- `ActivityLogScreen` is the log page: it reads the entries once when it opens, newest first, with each entry's details expandable, and exports them as JSON.
- `ErrorBoundary` wraps the layout's content in a `<svelte:boundary>`. It records what the content throws and shows a message with Try again in its place. The layout gives it the page's path as `resetKey`, so navigating builds the boundary afresh and a failed screen doesn't keep the next one from showing.
- `ThemeSync` draws nothing: it sets `data-theme` on `<html>` from the theme setting, following the device's setting live for `system`, and sets the `theme-color` meta to the shown theme's background, so the browser's bars match.
- `RoutinesScreen` is the Routines screen: the sort picker, "+ New routine", a `RoutineCard` per routine, which shows it or, in place, its `RoutineForm`, and the "Discard changes?" prompt. A form holds one `BlockEditor` per block, which previews the break at the target under its Break field, and its fields are `FormField`s, which pair a label with its hint and problem. Only one routine is open at a time. It edits through storage and calls the pure routine functions for everything else.
- `ConfirmDialog` is a yes-or-no dialog built on `ModalDialog`, for deleting a routine or a block and for discarding changes.
- `StatsScreen` is the Stats screen: the routine filter, the figures, a `DailyChart`, and a `TotalsTable` each for the weeks, the months and the routines. It works out what to show with `viewStats`, and shows a line pointing to the Timer when no work is saved. `DailyChart` draws LayerChart's `BarChart` inside an `aria-hidden` element, with the range buttons, and gives its text alternative as a visually hidden table of the same values.
- `button-colours.ts` holds the main and outlined buttons' Tailwind classes, which every screen and dialog shares.

### `src/routes`: the screens

- `+layout.ts` turns off server-side rendering, so the app renders only in the browser, and its `load` opens storage, reads the routines, the settings and the run in progress, and returns `{ timerSession, settingsSession, wakeLockKeeper, chimes, storage }` as the layout's `data`, which every page receives. It also starts the check for persistent storage, without waiting for it.
- `+layout.svelte` is the frame: the global styles from `layout.css`, `ThemeSync`, the header, the navigation and `UpdatePrompt`.
- `+page.svelte` is the Timer screen, showing the session from `data`. `routines/` and `stats/` hold the other screens, and `settings/` shows `SettingsScreen`. `settings/log/` shows `ActivityLogScreen`.
- `stats/+page.ts` reads every routine, deleted ones included, every work period and the run in progress from the layout's storage each time the screen is opened. `stats/+page.svelte` follows the run in progress (`watchRunInProgress`), reads the work periods and routines again whenever its revision changes (numbering each read and keeping only the latest, and keeping the run on screen until a read succeeds), and whenever the routines change (`watchRoutines`, after its first report), which is how it follows an import in another tab when no run is in progress, keeps the current moment, which it moves on every second while a work period counts, at local midnight and when the page becomes visible, and gives `StatsScreen` the work period in progress from `workInProgress`.
- `src/hooks.client.ts` has SvelteKit's `init`, which installs the global error handlers, and `handleError`, which records an error SvelteKit caught while loading or navigating, except a 404. The layout's `load` points `recordError` at storage with `useErrorLog`.
- `src/app.html` has a small inline script in its head that reads the theme mirror and sets `data-theme` and the `theme-color` meta before the first paint, making the same choice as `resolveTheme` and `THEME_COLOURS`.

### Tests and their helpers

- Unit tests sit beside their module as `*.test.ts`, component tests beside their component as `*.svelte.test.ts`, and storage tests beside their backend as `*.browser.test.ts`.
- `storage.browser.test.ts` is the suite every backend shares, and `dexie-storage.browser.test.ts` covers what only IndexedDB has: data kept after reopening, two connections at once, the saved schema and the database's name.
- `src/lib/testing/` holds test helpers: `durations.ts` (`seconds`, `minutes`, `hours`), `ids.ts` (`numberedIds`), `routines.ts` (`oneRoundRoutine`, `routineWith`), `run-records.ts` (`runInProgress`, `firstWorkPeriod`, `runWith`, `workPeriodWith`), `run-in-progress.ts` (`savedRunInProgress`, `runInProgressWith`) and `run-summary.ts` (`shownTotals`), `storage.ts` (`withRoutines`, `storageHolding`, since storage refuses a run whose routine it doesn't hold, so tests that save runs start from storage that holds their routines), `audio.ts` (a fake `AudioContext` and its sources), `contrast.ts` (`contrastRatio`, `MIN_OUTLINE_CONTRAST`), `time-zone.ts`, which pins the time zone for the stats tests, and `time-zone-santiago.ts`, which pins a zone whose clocks change at midnight.
- `e2e/` holds the Playwright journeys (`*.spec.ts`), with `clock.ts` (`openOnPausedClock`, `followLink`), `storage.ts` (`savedWorkPeriods`, read from the page's IndexedDB; `shared-run.spec.ts` runs two tabs of one browser context, which share one fake clock), `browser-apis.ts` (init scripts the alerts and Settings journeys install: `recordChimes`, a fake wake lock and a fake persistent storage answer), `service-worker.ts` (`waitForActiveWorker`), and `update-server.ts`, which serves the production build with a new service worker to browsers that ask. `e2e/production/` holds the journeys against the production build.

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
- Storage refuses to edit or delete the routine of the run in progress, an ended run's included until Done, and to save a new run whose routine isn't saved (storage with no routines at all included), so what's stored always passes a backup's checks.
- A change's run in progress, run and work periods are saved together or not at all, so a run is never saved as ended without its last work period, and a restored run never ends a work period that's already saved. Writes reach storage in the order they were made, so a late heartbeat can't bring back a run that Done forgot.
- A press is saved only if the stored run is still the one it was made from: every change gets a unique revision, and the save checks it in the same transaction. A tab that's refused takes the stored run, and keeps nothing of its own.
- A heartbeat writes only the time, never a whole run, so a stale tab's heartbeat can't undo another tab's press.
- Work is recorded by the tab that pressed, and only when its save is accepted, so each work period and run is saved once however many tabs are open. A tab that follows a change never saves it.
- A restored run comes back paused at its last heartbeat, so time after it never counts as work. A tab that opens while another tab is open joins the run live and doesn't pause it. A ready run is never saved.
- One tab sounds each chime. Each tab joins the Web Lock queue `cadoro-chimes` once a press has made its audio play, and only the holder schedules chimes. A tab whose audio can't be made or resumed never holds the lock, so it can't silence a tab that can play. Without Web Locks, or if the lock is refused, every unlocked tab sounds. A Preview plays in any tab and never takes the lock.
- Chimes are scheduled on the audio clock, ahead of their moment, whenever the run or the chosen chime changes, never on a tick. A volume change only sets the gain. A chime whose moment has passed is never scheduled, so a restore or another tab's change can't sound one late. Because the audio clock can stand still while time goes on, such as while a laptop sleeps, the scheduled chime is checked against the wall clock when the audio runs again, after an unlock, as the page shows, and once a second on `RunChimes`' own interval, which runs on every screen: if it's out of place by over 100 ms it's placed again, or dropped once its moment has passed. So a chime the audio clock would play late is dropped if the next of those runs before it plays. A background tab's tick can come about a minute apart, so one can still play late if the audio clock resumes and reaches it first. A chime whose file loads after its moment starts at once within a second, and is dropped after. Nothing sounds before a button press has unlocked the audio, and leaving the Timer screen isn't a press.
- The wake lock is held only while a timer counts, the page is visible and the setting is on, and is asked for again whenever the page becomes visible, or the browser lets it go by itself while the page is visible.
- The theme mirror in `localStorage` is the one use of `localStorage`, and storage owns it: only `DexieStorage` writes it, and IndexedDB stays the source of truth.
- Every routine change is logged at the storage interface, so no screen can skip it. The entry is written after the change in its own transaction, and a failure to write it is reported with `console.error` and never undoes or blocks the change. The log keeps the newest 5,000 entries.
- An import is all or nothing: the file is parsed and checked whole before anything is touched, and `replaceAllData` replaces everything in one transaction, so a failure or a repeated id leaves the old data as it was. It saves only the settings that differ from the defaults. It forgets the run in progress, keeps the log, and is logged afterwards like any change.
- Errors are recorded, never thrown from the recorder: `recordError` writes an `error` entry and, if that fails or no log is set yet, falls back to `console.error`, so an error handler can't cause an error of its own. `console.error` is that fallback only.
- The last routine can't be deleted: `deleteRoutine` refuses it in storage, and the Delete button is disabled with a hint, so there is always one to run.
- The routine of a run in progress can't be edited or deleted, from any tab, since every tab sees the shared run. The Routines screen shows it with disabled buttons, a disabled Save, and by ignoring a delete confirmed after the run began, and storage refuses it too (`planSave` and `planDelete`).
- An edit keeps the routine's saved position, creation date and deletion, so one worked out before another tab reordered can't undo the reorder.
- What's stored survives upgrades: schema versions 1 to 4 never change now that they're deployed, so a change to what's stored takes a new Dexie version with an upgrade, and a test for it.

## Cross-cutting concerns

### State in Svelte

- `TimerSession` keeps its fields in JavaScript's `#private` fields, so only its methods can change the run.
- The run is held in `$state.raw`, because the engine replaces it whole. The view is `$derived` from the run and the last tick's moment.
- An effect that should restart only when something changes reads a `$derived` of that thing, such as `isRunning`, not a value that changes on every tick.
- State about a screen rather than the run, such as whether Finish is asking, is the screen's own `$state`.

### Saving

- The buttons stay synchronous, and the screen changes at once. `TimerSession` puts every write, saves and Done's clear alike, on one promise chain (`#enqueue`), so each starts once the one before has finished, and doesn't wait for it.
- Each tab holds a shared Web Lock for as long as it's open, which the browser lets go when the tab closes or crashes. A tab opening checks for it before taking its own, since a heartbeat's age can't say whether another tab is alive.
- Leaving the Timer screen pauses the run, which is saved like a press, so it pauses the run in every tab. It isn't a button press, so it doesn't unlock the chimes.
- The run in progress is saved on every press that changes the run, on each tick while a timer counts, and as the page is hidden or closed. In a tab hidden for over 5 minutes, Chrome runs the tick about once a minute, so heartbeats come less often there.
- A failed save, read or request for persistent storage, and a failed Duplicate, Delete or Move on the Routines screen (which also shows a message above the list), is recorded with `recordError` as an `error` entry in the activity log, and the app carries on.
- Persistent storage is asked for at most once per launch: at startup when work is already saved, or else after the first work period is saved.
- A repeated identical error is one log entry with a count (`withRepeatCounted`), so a loop of errors can't push the routine history out of the log.
- Every re-read on the Stats screen is numbered and only the latest shows, and the screen keeps its old run and work periods until a read succeeds. `RoutineUsageKeeper` is reloaded as a run starts or work is saved, so the Timer's picker and its fallback routine sort alike.

### Styling and themes

- Tailwind classes only, with `@tailwindcss/forms` styling native controls. Native elements cover every widget, such as `<dialog>` and `<select>`.
- The `dark:` variant follows `data-theme` on `<html>`, which `app.html` starts as `dark`, its inline script sets from the theme mirror before the first paint, and `ThemeSync` then keeps in step with the theme setting. The `theme-color` meta follows the same way, so the browser's bars match the page. The manifest's `theme_color` is one file for every user, so it stays the default dark. Every element carries both its light and its dark colours.
- Rose is the accent and amber means overtime, and colour never carries meaning alone. Text keeps at least 5:1 contrast, and outlines and bars at least 3:1, in both themes. Every control, button, dialog and card border is `zinc-500` in both themes (4.83:1 on white, 3.67:1 on `zinc-900`, 3.08:1 on the dialog's `zinc-800`), and a progress bar's pale track has the same outline. Only the separators, such as the header's and the tab bar's border and the list dividers, stay paler. `outline-contrast.svelte.test.ts` measures the painted colours.
- Accessibility: the Timer has a polite `status` live region (`announcementFor`), progress bars are `progressbar`s with values, a form's opening moves the focus into its Title field, Cancel, Save and a confirmed delete put it on the routine's (or its neighbour's) Edit button, and drag handles, lists and items are out of the Tab order (`outOfTabOrder`), since Move up and Move down cover the keyboard.
- `<html>` has `scroll-pb-24` below `md`, so the browser scrolls a focused control clear of the fixed tab bar (WCAG 2.4.11).
- The layout is one centred column up to `max-w-3xl`, with a bottom tab bar on phones and header links from `md` (48rem).

### Testing

- Vitest's `server` project runs `*.test.ts` in Node, and its `client` project runs `*.svelte.test.ts` and `*.browser.test.ts` in Chromium through browser mode, where storage tests use the real IndexedDB, with a new database per test.
- Component tests find elements by role and label. The timer's tests drive the session with a fake clock and fake only `setInterval` and `clearInterval`, and the update prompt's replace the PWA plugin's module with `vi.mock`.
- The session's tests give it `InMemoryStorage` and read what was saved with `expect.poll`, since saves finish after the press. The persistence tests use a fake `StorageManager`, since the real one's answer depends on the browser's own judgement.
- Tests of local days pin the time zone to New York through `process.env.TZ`, set by importing `src/lib/testing/time-zone.ts` first, since Node re-reads it when it's assigned. A second test file, `stats-midnight-change.test.ts`, pins America/Santiago, where the clocks change at midnight. Its zone has daylight saving, so tests cover a period across midnight and across a clock change against hand-calculated values.
- The Stats screen's tests find the chart's values in its visually hidden table, since LayerChart's bars are `aria-hidden`.
- Tests write times as `minutes(25)`, not `25 * 60_000`, and keep their data visible rather than importing it from the code they check.
- Playwright's projects are `desktop` and `phone` against the dev server (`PORT`, 5173 by default), `production` against a build at `/cadoro` on port 4175, and `updates` against the update server on port 4176.
- Journeys that run the timer start on a paused fake clock with `openOnPausedClock`, move it with `fastForward`, and follow links with `followLink`, since SvelteKit waits on a timer before navigating. The fake clock carries on across `page.reload()`, so the reload journey checks exact times.
- Journeys observe chimes without listening: `recordChimes` makes `AudioContext.currentTime` follow `Date.now()`, so the fake clock moves the audio clock, and records each scheduled chime's start moment and file. A journey asserts those, which is the schedule, not real playback. Persistent storage and the wake lock are faked the same way.
- Component tests that check layout, such as the pinned controls and the scroll to the active block, import `layout.css`, since Tailwind's classes do nothing without it.
- Parallel Vitest browser runs, such as in two worktrees, can collide on a port ("Port 63315 already in use"), and running the command again fixes it.
- The Timer screen's tests fake a hidden page by replacing `document.visibilityState`'s getter and sending `visibilitychange` themselves.

### Docs and lint

- Every module-level declaration, type, field and prop has a TSDoc comment, checked by ESLint with `eslint-plugin-tsdoc` and `eslint-plugin-jsdoc`. Each component starts with a `<!-- @component -->` comment. Variables made with `$state`, `$derived` or `$props` are exempt.
- `npm run typecheck` fails on any Svelte warning.
- Signatures need explicit return types. typescript-eslint's typed rules are on, with `no-floating-promises`, `no-misused-promises` and `await-thenable` among them, and `require-await` off because promise-interface fakes have `async` methods that don't await.
- `noUncheckedIndexedAccess` is on, so an index that must exist goes through `blockAt` or `requireDefined`, never a bare `!`.
- ESLint enforces the invariants above in `eslint.config.js`, with per-file blocks that tests are exempt from. Only `src/lib/storage/` imports Dexie or uses `indexedDB`, and `localStorage` is only in `theme-mirror.ts`. Only `error-log.ts` writes to the console. The engine and the pure logic modules (the run, routine, stats, backup and CSV modules and `chime-schedule.ts`) import nothing from Svelte, SvelteKit or a component, and never call `Date.now()`, `new Date()` with no argument or `performance.now()`. A new pure module is added to the list in the config.
- Tests are linted with `@vitest/eslint-plugin` and `eslint-plugin-playwright`: no skipped or focused tests, every test asserts, and Playwright calls are awaited.
- Inline ESLint configuration is ignored (`noInlineConfig`) and `@ts-expect-error` is banned.
- `.claude/settings.json` is checked in. It asks before an edit to `eslint.config.js`, `tsconfig.json`, `playwright.config.ts`, `.github/workflows/**` or itself.

### Reordering

- Routines and blocks are reordered with `svelte-dnd-action`'s drag handles and, for the keyboard, with Move up and Move down. The routine list is a drag zone only while the sort is custom order and no routine is open, since the library shares its handle state across zones. Every move goes through the pure functions, so dragging and the buttons give the same result.
- In any other sort the list has no handles and no Move buttons, since a move would change only the custom order, which that list doesn't show.

### Builds, deploys and releases

- `optimizeDeps.include` in `vite.config.ts` lists the libraries that only lazily loaded screens import (`svelte-dnd-action`, `layerchart`, `date-fns`). Without it the dev server finds them mid-journey, re-bundles and reloads the page, which fails the test running then. Add a library there when a screen imports it and nothing on the first page does.
- The build is `adapter-static` with an `index.html` fallback, and nothing is prerendered. Workbox's service worker keeps every file, the chimes included, and answers every address with the fallback page, so the app works offline.
- A new version waits until the user reloads, and the prompt stays hidden during a run.
- CI runs the checks on every pull request, in Playwright's container image. A push to `main` that passes deploys to GitHub Pages, with a copy of the fallback page as `404.html`.
- Releases follow the README's Releasing section: `task release:bump` on the pull request, then `ci:watch-main`, `pages:check` and `release:publish` after the merge.
