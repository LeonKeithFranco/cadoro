# Cadoro Spec

## Overview

Cadoro is a self-hostable, offline-capable SvelteKit PWA for timing focused work. Its name blends cadence and Pomodoro. It builds on the Pomodoro technique, with two changes:

- **Work counts up.** A work period has a target, but it keeps counting past it until you choose to stop.
- **Breaks are earned.** A break is a percentage of the time you actually worked, so a longer work period earns a longer break.

These two ideas are often called Flowtime or Flowmodoro. On top of them, you build **routines** out of **blocks**, so one routine can mix different work targets and break lengths, such as three short cycles followed by one with a long break.

It's built primarily for one person. Anyone else can use it from GitHub Pages, with their data kept in their own browser, or run their own copy.

## Goals

- Let you build, save and reuse routines made of blocks, each with its own work target, break percentage and number of cycles.
- Make starting and running a routine quick, on a phone or a desktop.
- Record every work period and show useful stats about it, without clutter.
- Keep deployment simple: a static app hosted free on GitHub Pages, which anyone can open and install. Its built files can also be self-hosted on any web server.
- Act as a learning project for Svelte 5, SvelteKit and Tailwind CSS, and for browser APIs the weight tracker didn't use, such as Web Audio and Screen Wake Lock.

## Non-goals

- Accounts, login or multiple users within one deployment
- A custom backend or any server-side data storage. The optional Web Push work after 1.0 is the one exception, and it would hold only push subscriptions and due times.
- Sync between devices (each browser has its own data)
- Alerts while the phone is locked or the app is closed, before the optional Web Push work
- System notifications and vibration (alerts are sound only)
- Task lists, or labels and notes on work periods
- Recording breaks, or the number of pauses, in stats
- Banking unused break time (an open item, to revisit after using the app)

## Terms

| Term        | Meaning                                                                                        |
| ----------- | ---------------------------------------------------------------------------------------------- |
| Routine     | A named, saved plan made of one or more blocks, which repeats a set number of times or forever |
| Block       | Part of a routine: a work target, a break percentage and a number of cycles                    |
| Cycle       | One work period followed by its break, within a block                                          |
| Round       | One pass through all of a routine's blocks, in order                                           |
| Run         | One use of a routine, from pressing Play to the end of the last work period or Finish          |
| Work period | One stretch of counting-up work, from its start until Next or Finish                           |
| Target      | The work time a block aims for. Reaching it plays a chime but doesn't stop the timer           |
| Overtime    | Work time past the target                                                                      |

## Architecture constraints

- The app is SvelteKit only, built as static files with `adapter-static`, with no custom backend.
- Data is stored in the browser's IndexedDB.
- All data access goes through a storage interface, so a sync or backend option could be added later without rewriting the UI.
- GitHub Pages and self-hosted copies only serve static files. None of them ever sees the app's data.
- Timer logic and stats calculations are pure functions, separate from Svelte components, so they can be unit tested exactly.
- Elapsed and remaining time are always calculated from saved timestamps, never by counting ticks, so the timer stays accurate when the browser slows or suspends the page.

## Data model

```ts
type Routine = {
	id: string; // UUID.
	title: string; // 1–50 characters.
	rounds: number | 'infinite'; // 1–99, or infinite.
	blocks: Block[]; // 1–20, in run order.
	customPosition: number; // Its place in the custom sort order.
	createdAt: string; // UTC timestamp.
	deletedAt: string | null; // Deleted routines are kept, hidden, so stats keep their name.
};

type Block = {
	id: string; // UUID.
	title: string; // 1–50 characters.
	targetMinutes: number; // Whole minutes, 1–240.
	breakPercent: number; // Whole number, 1–100.
	cycles: number; // 1–99. Always 1 when it's the routine's only block.
};

type Run = {
	id: string;
	routineId: string;
	startedAt: string; // UTC timestamp.
	endedAt: string | null; // null while the run is in progress.
	outcome: 'completed' | 'finished' | null; // completed: the last work period ended. finished: Finish was pressed.
	roundsReached: number;
};

type WorkPeriod = {
	id: string;
	runId: string;
	routineId: string;
	blockId: string;
	targetMinutes: number; // The block's target when the period ran, so later edits don't change history.
	segments: { start: string; end: string }[]; // UTC timestamps of each unpaused stretch.
	workedMs: number; // The sum of the segments, at full precision.
};

type Settings = {
	theme: 'system' | 'light' | 'dark'; // Defaults to "dark".
	volume: number; // 0–100. Defaults to 70.
	targetChime: string; // Chime id, played when a work period reaches its target.
	breakChime: string; // Chime id, played when a break reaches 0:00. Defaults to the same chime as targetChime.
	keepScreenAwake: boolean; // Defaults to true.
	routineSort: RoutineSort; // Defaults to "custom".
	lastRoutineId: string | null;
};

type RoutineSort =
	'custom' | 'title-asc' | 'title-desc' | 'last-used' | 'most-work' | 'newest' | 'oldest';
```

- Exact moments, such as when a work period started, are stored as UTC timestamps. Days, weeks and months are worked out in the device's local time zone when stats are shown.
- Work time is stored to the millisecond and rounded only for display.
- A work period stores its unpaused segments, so paused time is never counted as work, and a period that runs past midnight can be split exactly between the two days.

## Features

### Routines and blocks

- A routine has a title, a number of rounds (1–99, or infinite) and 1–20 blocks.
- A block has a title, a work target in whole minutes (1–240), a break percentage (a whole number, 1–100) and a number of cycles (1–99).
- Only a routine can repeat forever. Every block has a set number of cycles.
- A routine with one block has 1 cycle. With one block, cycles and rounds do the same job, since 3 cycles of 2 rounds is the same run as 6 rounds, so rounds repeat a single block. Cycles only matter with two or more blocks.
- A run goes through block 1's cycles, then block 2's, and so on to the last block, which makes one round. Then the next round starts at block 1.
- Every work period is followed by its break, including at the boundary between two blocks, except the routine's very last work period. A finite routine's run ends as soon as its last work period ends, and that period's break doesn't run.

### Starter routines

On first launch, with no data yet, the app creates two routines:

| Routine                 | Rounds   | Blocks                                                        |
| ----------------------- | -------- | ------------------------------------------------------------- |
| Classic                 | Infinite | 25 min at 20% (a 5 min break), 1 cycle                        |
| Classic with long break | Infinite | 25 min at 20%, 3 cycles; then 25 min at 60% (15 min), 1 cycle |

They can be edited and deleted like any other routine, and aren't created again once deleted.

### Running a routine

- **Play** starts the run with the first work period. During a run, the same button pauses and resumes.
- **Work counts up** from 0:00. At the target, the target chime plays once, the timer changes look to show overtime, and it keeps counting.
- **Next** ends the current work period at any time, even before the target, and starts its break. The work period still counts as a completed cycle.
- **The break earned** is the time actually worked times the block's break percentage, with no cap or minimum. It's rounded once, to the nearest whole second, when the break starts.
- **Breaks count down.** At 0:00 the break chime plays, and the app waits for you to press Play before the next work period starts.
- **Next during a break** ends it early and starts the next work period. The unused break is lost.
- **Pause** stops the work or break timer. Paused time doesn't count as work, and a paused break keeps its remaining time.
- **Finish** asks for confirmation, then ends the run. The current work period, if any, is saved up to that moment. This is how an infinite routine ends, and how a finite one ends early.
- Before a run starts, Next and Finish are disabled.
- A routine can't be edited or deleted while it's running, and the routine picker is locked until the run ends.

### The timer screen

- The routine picker at the top selects which routine to run. The app opens on the last routine used.
- Each block shows its title, its target and break percentage, and two boxes: the work timer above the break timer, as in the original sketch.
- The active timer is highlighted, and the screen shows exactly where the run is in both rounds and cycles, such as "Round 2 of 4 · Block 2 of 3 · Cycle 1 of 3". For an infinite routine it shows "Round 5" with no total. A part whose total is 1 never changes, so it's left out: Classic shows just "Round 5", and a block of 1 cycle shows no cycle.
- While a work period runs, its box shows the elapsed time and the target, such as `31:40 / 25:00`, and the break box shows the break earned so far, which updates as you work.
- Times show as `m:ss` under an hour and `h:mm:ss` from an hour.
- Play/Pause, Next and Finish sit at the bottom of the screen.

### Run summary

When a run ends, by its last work period or by Finish, a dialog shows a summary of the run:

- Total work time
- Work periods completed
- Rounds reached
- Total overtime

Closing the dialog returns the routine to its starting state, ready for another run. The run is already saved, so closing loses nothing.

### Leaving and returning

- The run in progress is saved whenever it changes, and a heartbeat records the time every second while the app is open, on the same tick that updates the display, and when the page is hidden.
- If the app is closed, reloaded, or stopped by the phone mid-run, reopening it restores the run, paused at the last heartbeat. Time after that doesn't count as work.
- While the app stays open in a background tab, the timer keeps running and stays accurate.

### Alerts

- Alerts are sound only: one chime when a work period reaches its target, and one when a break reaches 0:00.
- The app has a small set of openly licensed or royalty-free chimes, all normalised to the same loudness. Settings has one picker for each alert, which use the same chime by default, a preview button for each, and one volume slider.
- Each chime's source and licence are recorded in the repo.
- Chimes play on time in a background tab on desktop.
- While the phone is locked or the app is closed, chimes can't be relied on, because a static PWA can't run on a schedule without a server. This is documented as a limitation. The optional Web Push work after 1.0 would address it.

### Keeping the screen awake

- While a run is in progress, the app asks the browser to keep the screen on with the Screen Wake Lock API, unless that's turned off in Settings. It's on by default.
- The browser drops the lock when the page is hidden, so the app asks again when it's visible.
- Where the API isn't supported, the setting says so and the app works the same.

### Routines screen

- The Routines screen lists every routine that hasn't been deleted.
- **Sorting:** the list can be sorted by custom order, title (A–Z or Z–A), last used, most work time, newest or oldest. The chosen sort is remembered, and the timer screen's picker uses the same order.
- **Custom order:** routines can be reordered with a drag handle, or with Move up and Move down buttons for keyboard and screen reader users. These controls only show while the sort is set to custom order.
- **New routine:** a "+ New routine" button adds a new routine at the top of the list, already open for editing, with a blank title that must be filled in, infinite rounds, and one block of 25 minutes at 20% for 1 cycle. Cancel removes it.
- **Duplicate:** makes a copy named "<title> (copy)" with the same blocks. Its stats start empty.
- **Delete:** asks for confirmation. A deleted routine's work stays in the stats, labelled as deleted.

### Editing a routine

- Editing happens in place: Edit expands the routine within the Routines list into a form.
- Only one routine is open for editing at a time. Opening another, or leaving the screen, with unsaved changes asks "Discard changes?" first.
- Changes apply only on Save. Cancel undoes all of them.
- The form edits the routine's title and rounds, and each block's title, target, break percentage and cycles.
- Each block has a drag handle, Move up and Move down buttons, Duplicate, which inserts a copy below it, and Delete, which asks for confirmation. Delete is disabled when only one block is left.
- An "Add block" button below the blocks adds a new block at the end.
- While a routine has one block, its cycles field shows 1 and is disabled, with a hint that rounds repeat a single block. Deleting blocks down to one resets the remaining block's cycles to 1, and rounds stay as they were.
- Every field is validated against the limits in the data model before Save is allowed.
- Renaming a routine keeps its history attached.

### Stats

All stats come from saved work periods and runs.

| Stat                | Definition                                                                                      |
| ------------------- | ----------------------------------------------------------------------------------------------- |
| Today               | Total work time today                                                                           |
| Daily chart         | Work time per day over a chosen range                                                           |
| Weekly and monthly  | Total work time per week, starting on Monday, and per calendar month                            |
| All time            | Total work time overall and per routine, including deleted routines                             |
| Streak              | Days in a row with any work; the current streak and the longest                                 |
| Time against target | Total time worked divided by the total of those periods' targets, as a percentage, such as 112% |
| Targets reached     | The share of work periods that reached their target, as a percentage                            |

- Time against target adds up the time and targets before dividing, rather than averaging each period's percentage. Each period then counts in proportion to its target, so an accidental 4-second period barely moves it, and periods with 25 and 50 minute targets compare fairly.
- Work time is split across days at midnight, using each period's unpaused segments.
- The current streak stays alive through today until midnight, so it doesn't drop to 0 just because you haven't worked yet today.
- The stats can show every routine together or one routine at a time.
- The daily chart's range presets are 7 days, 30 days, 90 days, 1 year and All, counting back from today.

### Export and import

- **CSV export:** downloads every work period as one row, with its routine, block, start and end times, time worked and target. Times are UTC timestamps, and time worked is in seconds at full precision.
- **JSON backup:** downloads everything: routines (including deleted ones), runs, work periods and settings.
- **JSON import:** restores a backup. It shows how many routines, runs and work periods the file holds, then replaces all current data once confirmed.
- A file that isn't a valid backup is rejected whole, and nothing changes.

### Settings

- Theme: System, Light or Dark, defaulting to Dark
- The chime for each alert, and the volume
- Keep the screen awake during a run
- CSV export, JSON backup and import
- Persistent storage status
- The activity log
- The app's version

### Activity log

```ts
type LogEntry = {
	id: number; // Auto-incrementing.
	timestamp: string; // UTC.
	type: 'change' | 'error';
	message: string;
	details?: Record<string, unknown>;
};
```

- **Changes:** every routine created, edited, duplicated, reordered and deleted, and every import, is recorded at the storage interface, so no feature can skip it. Edits include the old and new values. Runs and work periods aren't logged, because the stats already hold them.
- **Errors:** uncaught errors are recorded by a global handler and an error boundary.
- Entries are stored in IndexedDB, and only the newest 5,000 are kept.
- A page within Settings lists entries, newest first, and can export them as a JSON file.
- Log entries never leave the device, except through that export.
- A failure to write a log entry never blocks the data change.

### PWA

- Installable on phone and desktop.
- Works fully offline after the first load.
- Shows a prompt to reload when a new version is available. It never reloads on its own during a run.
- Requires HTTPS, except on `localhost`.

### Persistent storage

- The app asks the browser for persistent storage with `navigator.storage.persist()`, so a browser low on space doesn't delete the data without asking.
- It asks after the first work period is saved, and again at startup while storage isn't persistent yet. It doesn't ask on an empty first visit, because Firefox shows a prompt for it.
- Settings shows whether storage is persistent, with a button to ask again when it isn't.
- The browser can refuse, and the app works the same either way.
- Persistent storage doesn't protect against clearing site data, uninstalling or changing devices, so the JSON backup is still the backup.

## Screens

1. **Timer:** the routine picker, the running routine and its controls
2. **Routines:** the list, sorting, and editing in place
3. **Stats**
4. **Settings**, with the activity log as a page within it

The app is a single-page app, and each screen has its own URL. Navigation is a bottom tab bar on phones and a top nav on desktop.

## Deployment

- The source lives in the public GitHub repo `cadoro`, under the MIT license. It was renamed from `pomodoro` before the first deploy, because the Pages address and installed copies follow the repo's name.
- Every change reaches `main` through a pull request, from the very first one.
- GitHub Actions runs checks on every push and pull request.
- The build's base path comes from an environment variable, so the same code serves from `/cadoro/` on GitHub Pages and from `/` when self-hosted.
- Versions follow semantic versioning from the first deploy, which is 0.1.0. Every merged pull request that changes the app bumps the version and is tagged and released. 1.0.0 is the release that completes this spec.

### GitHub Pages

- A push to `main` that passes all checks builds the app and deploys it to GitHub Pages with GitHub Actions.
- The app is served at `https://<username>.github.io/cadoro/`, with no custom domain. This is the main copy.
- Pages has no route fallback, so the build provides a `404.html` that starts the app, and refreshing a screen's URL still works.
- Every Pages site under one GitHub account shares the `<username>.github.io` origin, so those sites can read each other's browser storage.

### Self-hosting

- `npm run build` with no base path set gives static files for the root of a site. Any web server can serve them.
- The server must return the app's fallback page for app routes, so refreshing a screen's URL works.
- Off `localhost`, the server needs HTTPS, or the service worker won't run and the app can't be installed.

### Optional, after 1.0

- **Web Push:** a small server, such as a free Cloudflare Worker, that sends a push message when a target or break end is due, so alerts reach a locked phone. It holds only push subscriptions and due times, needs notification permission, and on iPhones only works for an installed app.
- **Container image and homelab:** as in the weight tracker, a Podman image with unprivileged nginx, published to `ghcr.io`, and run on the homelab.

## Data limitations

These follow from browser-only storage and should appear in the README:

- Phone and desktop hold separate data. JSON backup and import is the only way to move it.
- Clearing browser data deletes everything that wasn't backed up.
- Data belongs to the browser and the exact site address. Opening the app at a different address starts with an empty app, so back up first.
- Chimes can't be relied on while the phone is locked or the app is closed.

## Testing

Tests guard against regressions and are written after the code, once its behaviour is right, not test-first. A bug fix starts with a regression test that's seen to fail.

- **Unit:** the run's progression through blocks, cycles and rounds; earned break and its rounding; pause and resume; restoring a run from its last heartbeat; every stat, including splitting at midnight, Monday weeks and streaks; routine validation and sorting; CSV export; JSON backup validation
- **Component:** the timer screen, the routine editor and the stats screen, run in a real browser with Vitest's browser mode
- **End to end (Playwright):** create and edit a routine; run work, break and work with a controlled clock; reach a target and hear the chime; finish and see the summary; see the work in stats; reload mid-run and find it paused; back up and restore; run at desktop and phone sizes, plus offline against a production build
- Test data must be synthetic.
