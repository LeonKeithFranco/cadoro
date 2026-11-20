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
- Use Svelte 5, SvelteKit and Tailwind CSS, and browser APIs such as Web Audio and Screen Wake Lock.

## Non-goals

- Accounts, login or multiple users within one deployment
- A custom backend or any server-side data storage
- Sync between devices (each browser has its own data)
- Alerts while the phone is locked or the app is closed (see Data limitations)
- System notifications and vibration (alerts are sound only)
- Task lists, or labels and notes on work periods
- Recording breaks, or the number of pauses, in stats
- Banking unused break time

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
	roundsReached: number; // Counting the round it ended in. 0 while the run is in progress.
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
	targetChime: string; // Chime id, played when a work period reaches its target. Defaults to "bell-ding-1".
	breakChime: string; // Chime id, played when a break reaches 0:00. Defaults to "bell-ding-1", the same as targetChime.
	keepScreenAwake: boolean; // Defaults to true.
	routineSort: RoutineSort; // Defaults to "custom".
	lastRoutineId: string | null; // The routine the last run started with. null until a run has started.
};

type RoutineSort =
	'custom' | 'title-asc' | 'title-desc' | 'last-used' | 'most-work' | 'newest' | 'oldest';
```

- Exact moments, such as when a work period started, are stored as UTC timestamps. Days, weeks and months are worked out in the device's local time zone when stats are shown.
- Work time is stored to the millisecond and rounded only for display.
- A work period stores its unpaused segments, so paused time is never counted as work, and a period that runs past midnight can be split exactly between the two days.
- Storage keeps only the settings that have been changed, and every other setting reads as its default, so a default changed in a later version reaches users who never touched it. A chime id the app doesn't have, such as one a later version removed, plays and shows as the default chime.

## Features

### Routines and blocks

- A routine has a title, a number of rounds (1–99, or infinite) and 1–20 blocks.
- A block has a title, a work target in whole minutes (1–240), a break percentage (a whole number, 1–100) and a number of cycles (1–99).
- Only a routine can repeat forever. Every block has a set number of cycles.
- A routine with one block has 1 cycle. With one block, cycles and rounds do the same job: one block of 3 cycles over 2 rounds is the same run as one block of 1 cycle over 6 rounds. So a single block repeats through rounds, and cycles only matter with two or more blocks.
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
- **Finish** asks for confirmation, then ends the run. The run keeps counting while it asks, so the current work period, if any, is saved up to the moment Finish is confirmed. Cancel or Escape leaves the run as it was. This is how an infinite routine ends, and how a finite one ends early.
- Before a run starts, Next and Finish are disabled.
- A routine can't be edited or deleted while it's running, or while its ended run's summary is still open (until Done).
  - The routine picker is locked until the run ends.
  - The run is shared between tabs, so this holds in every tab.
  - On the Routines screen, its Edit and Delete are disabled, with a hint.
  - A routine already open for editing when its run starts can't be saved until the run ends, and a delete confirmed after that is ignored.
  - Storage enforces it too: saving or deleting the routine of the run in progress is refused, whatever screen or tab asks.
- A run can't start on a routine that isn't saved, as when another tab imported a backup that replaced the routines before this tab heard of it. Storage refuses the new run, and the failure is logged, since a run of an unknown routine would make every later backup fail. That includes storage that holds no routines at all.

### The timer screen

- The routine picker at the top selects which routine to run, in the order chosen for the Routines screen. The app opens on the routine the last run started with, saved when that run started, or on the first routine in the picker when there is none or it's been deleted.
- The blocks stack in one column, in the order the run goes through them, on every screen size.
- Each block shows its title, its target and break percentage, and two boxes: the work timer above the break timer.
- The active timer is highlighted, and the screen shows exactly where the run is in both rounds and cycles, such as "Round 2 of 4 · Block 2 of 3 · Cycle 1 of 3". For an infinite routine it shows "Round 5" with no total. A part whose total is 1 never changes, so it's left out: Classic shows just "Round 5", and a block of 1 cycle shows no cycle.
- A block of two or more cycles also shows its cycle across from its title, such as `Cycle 2 / 3`, matching the position above. Before Play, the first block shows the cycle the run will start on. A block the run isn't in shows `Cycle 0 / 3`.
- Each box has its label on the left, its time on the right and a progress bar below. Boxes not in use show zeroed times, such as `0:00 / 25:00` and `0:00`, with empty bars.
- While a work period runs, its box shows the elapsed time and the target, such as `31:40 / 25:00`, and its bar fills towards the target. The break box below is labelled "Break earned" and shows the break earned so far, which updates as you work.
- Past the target, the work box's outline, time and bar turn amber, its bar stays full, and its label reads "Work · Overtime", so overtime isn't shown by colour alone.
- During a break, the break box counts down, and its bar shows the break left out of the break earned. The block's work box keeps the time that earned the break, with its bar as it was. At 0:00 the break box reads "Break over".
- Times show as `m:ss` under an hour and `h:mm:ss` from an hour.
- Play/Pause, Next and Finish sit below the blocks. When the blocks are taller than the screen, they stay pinned at the bottom of it, above the phone's tab bar.
- When the run moves to a block that's out of view, the page scrolls it into view. Nothing scrolls when every block fits.

### Run summary

When a run ends, by its last work period or by Finish, a dialog headed "Run summary" names the routine and shows the run's totals:

- Total work time
- Work periods completed
- Rounds reached
- Total overtime

Done or Escape closes the dialog and returns the routine to its starting state, ready for another run. The run is already saved, so closing loses nothing. Until it's closed, the summary stays open, even after a visit to another screen or a reload.

### Leaving and returning

- The run in progress is saved whenever it changes. While a timer counts, a heartbeat records the time every second, on the same tick that updates the display, and again when the page is hidden.
- If the app is closed, reloaded, or stopped by the phone mid-run, reopening it restores the run, paused at the last heartbeat. Time after that doesn't count as work.
- While the app stays open in a background tab, the timer keeps running and stays accurate.
- Opening another screen in the app, such as Stats, pauses the run, work or break, and Play resumes it on the way back. Switching screens counts as stepping away, unlike a background tab.

### Several tabs

- With the app open in several tabs, or installed and in a browser tab too, every tab shows the same run. A press in one shows in the others, and each work period is recorded once.
- Leaving the Timer screen in one tab pauses the run in every tab.
- A tab that opens while another tab is open joins the run live, without pausing it. A saved run comes back paused at its last heartbeat only when no other tab is open.
- A press in a tab that's behind, because another tab changed the run first, is refused, and that tab shows the saved run instead.

### Alerts

- Alerts are sound only: one chime when a work period reaches its target, and one when a break reaches 0:00.
- The app has four openly licensed (CC0) chimes, all normalised to the same loudness, and both alerts play the first by default. Settings has one picker for each alert, a Preview button for each, and one volume slider, saved when the slider is released.
- Each chime's source and licence are recorded in the repo.
- Chimes are scheduled ahead, on the audio clock, so they play on time in a background tab on desktop. They're kept offline with the app.
- Besides the audio clock, a timer of the chimes' own checks once a second, on every screen, that the scheduled chime is still in place, so a tab away from the Timer screen that was asleep places it again or drops it. It never counts time.
- A chime is due only while its moment is still ahead. Reaching a target after a reload, or a break that was already over, never plays one late, and a break that earned 0 seconds is silent. Pause, Next, Finish and another tab's change move or cancel the scheduled chime, and a chime already playing finishes.
- Browsers allow sound only after a gesture, so nothing sounds until a button has been pressed in the tab. Every button press counts, not only Play.
- With the app open in several tabs, only one tab sounds each chime, and the next tab takes over when it closes. Where the browser can't take turns, every tab that has had a button pressed sounds it.
- A Preview plays at once in the tab where it's pressed, at the chosen volume, whether or not that tab holds the chimes' turn, and doesn't change the run's scheduled chimes.
- A chime file that fails to load is logged once and not retried.
- While the phone is locked or the app is closed, chimes can't be relied on (see Data limitations).

### Keeping the screen awake

- While a work period or break is counting, the app asks the browser to keep the screen on with the Screen Wake Lock API, unless that's turned off in Settings. It's on by default.
- The lock is released on Pause, when the run ends, when the setting is turned off, and when the page is hidden. The app asks again when the page is visible and a timer is counting.
- A refused request is logged, and the app carries on.
- Where the API isn't supported, the checkbox is disabled and unchecked, with a note that the screen may turn off during a run, and the app works the same.

### Routines screen

- The Routines screen lists every routine that hasn't been deleted.
- **Sorting:** the list can be sorted by custom order, title (A–Z or Z–A), last used, most work time, newest or oldest. The chosen sort is remembered, and the timer screen's picker uses the same order.
  - Titles compare ignoring case and accents. Last used is the start of a routine's latest run, with routines never run last. Most work time sums the work of every work period of the routine, most first. Newest and oldest go by creation date.
  - Routines that tie in a sort stay in custom order.
- **Custom order:** routines can be reordered with a drag handle, or with Move up and Move down buttons for keyboard and screen reader users. These controls only show while the sort is set to custom order.
- **New routine:** a "+ New routine" button adds a new routine at the top of the list, already open for editing, with a blank title that must be filled in, infinite rounds, and one block titled "Focus" of 25 minutes at 20% for 1 cycle. Cancel removes it.
- **Duplicate:** makes a copy named "<title> (copy)" with the same rounds and blocks, placed just below the original in custom order. A title too long to fit 50 characters with the suffix is cut, so the copy's title is still valid. Its stats start empty.
- **Delete:** asks for confirmation. A deleted routine's work stays in the stats, labelled as deleted. Delete is disabled on the only remaining routine, with a hint saying why, so there is always one to run.
- A failed Duplicate, Delete or Move shows a short message above the list, as a failed Save does in its form, and the failure is logged. A failed Move puts the routines back in their saved order. The message clears on the next Duplicate, Delete or Move.

### Editing a routine

- Editing happens in place: Edit expands the routine within the Routines list into a form.
- Only one routine is open for editing at a time. Opening another, or leaving the screen, with unsaved changes asks "Discard changes?" first.
- If the routine being edited is deleted in another tab, its form closes with a notice. If its title, rounds or blocks are changed in another tab, the form keeps the user's changes and says the routine was changed elsewhere and that Save will overwrite it.
- Changes apply only on Save. Cancel undoes all of them. Save on a routine with no changes closes the form and saves and logs nothing, and a change that only adds or removes spaces around a title isn't a change.
- Titles are trimmed of spaces at both ends before they're checked, so a title of only spaces is blank, and they're saved trimmed.
- Editing never changes a routine's place in the custom order.
- The form edits the routine's title and rounds, and each block's title, target, break percentage and cycles.
- Each block has a drag handle, Move up and Move down buttons, Duplicate, which inserts a copy below it with every field kept, and Delete, which asks for confirmation. Delete is disabled when only one block is left.
- An "Add block" button below the blocks adds a new block at the end, titled "Focus", with a 25-minute target, a 20% break and 1 cycle. It's disabled at 20 blocks.
- While a routine has one block, its cycles field shows 1 and is disabled, with a hint that rounds repeat a single block. Deleting blocks down to one resets the remaining block's cycles to 1, and rounds stay as they were.
- Every field is validated against the limits in the data model before Save is allowed.
- Renaming a routine keeps its history attached.

### Stats

Stats come from saved work periods. The work period in progress counts too, as the last bullet below says.

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
- Every range includes today, so 7 days is today and the 6 days before. A year is 365 days. "All" starts on the first day with work, or is just today when there is none. The chart has a bar for every day of its range, with an empty one for a day without work.
- Weeks start on Monday, and a week is labelled by its Monday, such as "Week of Nov 16, 2026". Months are labelled such as "November 2026". Days, weeks and months are local, so a day with a daylight saving change is 23 or 25 hours long.
- The weekly and monthly lists show only the weeks and months with work, newest first. All time per routine lists only routines with work, most worked first, with equal totals ordered by title. Work by a routine that can't be found counts in the overall total but has no row of its own.
- Time against target and targets reached are shown as whole percentages, rounded to the nearest, and as "-" when there are no work periods. A period reached its target when it worked at least the target, so working exactly the target counts.
- A deleted routine is labelled "(deleted)", such as "Old routine (deleted)", in the routine filter and in all time per routine. Choosing it shows its work.
- With the routine filter on one routine, every figure and list narrows to it. The screen's empty state, a line pointing to the Timer, replaces everything only when no work at all is saved, so a routine with no work shows zeros and lists that say "No work yet." instead.
- The chart's text alternative is a visually hidden table named "Work time per day", with a row for each day of the range, named with its year, such as "Nov 19, 2026", so a range over several years has no repeats. The bars themselves are hidden from assistive technology.
- The work period in progress counts as work done: in Today, the chart, the weekly, monthly and all-time totals and the streaks, up to the moment the run was paused, or up to now while it counts. It is left out of time against target and targets reached until it ends, since it has no final time to compare. A run on a break has none, since its work period is saved already. The screen follows the saved run, so it shows a run that another tab starts, pauses or ends, along with the work periods that tab saves, and moves on every second while a work period counts.
- When the saved run changes, the screen reads the work periods and routines again, and keeps showing what it has until that read arrives. Reads are numbered, and only the latest shows, so a slow older read finishing late never replaces a newer one. If a read fails, the failure is logged and the screen keeps both the work periods and the run it shows, until a later read succeeds, so a period that just ended never drops out of the figures.
- Today moves on at local midnight and when the page becomes visible again, so a screen left open overnight shows the new day.
- A day is the period from one local midnight to the next. Where the clocks change at midnight, so that the change day has no midnight and starts at 01:00, the next day still starts at its own midnight.

### Export and import

- **CSV export:** downloads every work period as one row, with its routine, block, start and end times, time worked and target. Times are UTC timestamps, and time worked is in seconds at full precision.
  - The columns are `routine`, `block`, `started_at`, `ended_at`, `worked_seconds` and `target_minutes`, oldest work period first. The file has no byte order mark, its lines end with CRLF, and a field with a comma, quote or line break is quoted, with quotes doubled, as RFC 4180 says.
  - Routine and block titles are those the routine has now, or empty when the routine or the block no longer exists. A work period's start is its first segment's start and its end is its last segment's end, so pauses sit between them.
  - Times are written as UTC ISO strings, such as `2026-11-19T09:00:00.000Z`, and `worked_seconds` is the milliseconds worked divided by 1,000, such as `1500.25`.
  - A title that starts with `=`, `+`, `-`, `@`, a tab or a carriage return gets a single quote in front, as OWASP advises against CSV injection, so a spreadsheet shows it as text instead of running it as a formula. Only the routine and block titles are changed, not the numbers and timestamps.
- **JSON backup:** downloads everything: routines (including deleted ones), runs, work periods and settings. The run in progress and the activity log aren't in it.
  - The file is one object, `{ app, formatVersion, exportedAt, routines, runs, workPeriods, settings }`. `app` is always `"cadoro"`, `formatVersion` is 1, and `exportedAt` is a UTC timestamp. A change to the format raises `formatVersion`, and an app rejects a version it doesn't know.
- **JSON import:** restores a backup. It shows how many routines, runs and work periods the file holds, the days of its first and last runs and the day it was made, in the user's time zone, then replaces all current data once confirmed.
  - Import replaces the run in progress, which it forgets, since it could name a routine the backup lacks. Every other tab follows the new data, Stats included, whether or not a run was in progress. The activity log is kept, and the import is added to it.
  - The backup holds every setting, so it reads on its own, but import saves only the settings that differ from the app's current defaults, as any save does, so a setting the backup holds at its default stays unchanged for later versions.
  - A run's `endedAt` is never earlier than its `startedAt`: if the device's clock moved back before Finish, the run ends at its start.
  - Import is all or nothing: if it fails part way, the old data stays exactly as it was.
- A file that isn't a valid backup is rejected whole with the reason, and nothing changes. It's rejected when:
  - it isn't JSON, or isn't a Cadoro backup (`app` isn't `"cadoro"`), or has a `formatVersion` the app doesn't know;
  - a field is missing or of the wrong type, or breaks a limit of the data model, so every routine must pass the same checks the Routines screen makes;
  - a timestamp isn't an exact UTC ISO string;
  - a run names a routine the file lacks, in which case the reason names the run by its id and start;
  - a work period's `workedMs` isn't the sum of its segments, a segment or run ends before it starts, or its routine isn't its run's routine;
  - the `lastRoutineId` setting names no routine; or
  - two routines, two runs or two work periods share an id.
  - A work period's `blockId` may name a block its routine no longer has, since editing a routine can remove blocks.
- The files are named after what they hold and the day they were made in the user's time zone, such as `cadoro-backup-2026-11-19.json`, `cadoro-work-periods-2026-11-19.csv` and `cadoro-activity-log-2026-11-19.json`.

### Settings

- Theme: System, Light or Dark, defaulting to Dark. System follows the device's light or dark setting live. The saved theme shows before the first paint, so there's no flash of the wrong one.
- The chime for each alert, with a Preview button, and the volume
- Keep the screen awake during a run
- CSV export, JSON backup and import
- Persistent storage status
- The activity log
- The app's version

A change is saved as it's made, and shows in every open tab.

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

- **Changes:** every routine created, edited, duplicated, reordered and deleted, and every import, is recorded at the storage interface, so no feature can skip it. Edits include the old and new values, and a reorder that changes nothing isn't logged. Runs and work periods aren't logged, because the stats already hold them.
- **Errors:** uncaught errors are recorded by a global handler and an error boundary, and so are the errors SvelteKit catches while loading or navigating (but not a 404). So is every failed save, read or request the app handles itself, such as a failed save of the run, the settings or a routine, or a failed request for persistent storage. An entry's `message` says what failed, and its `details` hold the error's `name`, `message`, `stack` and, when it has one, `cause`, or, for something thrown that isn't an `Error`, its text as `value`. Recording an error never throws. If the log can't take the entry, it goes to the console instead.
  - **Repeats:** an error with the same message, error name and error message as the newest entry, within a minute of that entry's last repeat, isn't added as an entry. The newest entry gains `details.count`, how many times it happened, and `details.lastTimestamp`, when it last did, and keeps its own timestamp as the first. So an error that repeats, such as an `error` event firing in a loop, stays one entry and can't push the routine history out of the 5,000. Only an error directly after the same error collapses, and changes never do.
- When a screen throws while rendering, a message with a Try again button replaces it, and the error is recorded.
- Entries are stored in IndexedDB, and only the newest 5,000 are kept.
- A page within Settings, reached from its Data card, lists entries, newest first, and can export them as a JSON file. It reads the log once when it opens and doesn't update while it's open, so an entry written meanwhile shows when the page is opened again.
- An import's entry is a change with the backup's format version, when it was made, and how many routines, runs and work periods it held.
- Log entries never leave the device, except through that export.
- A failure to write a log entry never blocks the data change.

### PWA

- Installable on phone and desktop.
- Works fully offline after the first load.
- Shows a prompt to reload when a new version is available. It never reloads on its own during a run.
  - The prompt is a card reading "A new version is ready.", with Reload and Later. It floats above the phone's tab bar, and sits in the bottom-right corner on wider screens, in the page's opposite colours.
  - The card stays hidden while a run is in progress, and shows once the run ends, or before Play. Reload hands over to the new version and reloads the page. Later hides the card, and the new version takes over the next time the app opens.
  - The browser looks for a new version whenever the app opens or reloads. The app doesn't check again while it stays open.
  - With the app open in several tabs, every tab shows the same run, so every tab hides the card while it's in progress, and shows it once the run ends. Reload in one tab then reloads every tab.
- Requires HTTPS, except on `localhost`.

### Persistent storage

- The app asks the browser for persistent storage with `navigator.storage.persist()`, so a browser low on space doesn't delete the data without asking.
- It asks at most once per launch: at startup once any work period is saved, or else after the first work period is saved. It doesn't ask on an empty first visit, because Firefox shows a prompt for it.
- Settings shows whether storage is persistent as On or Off, or Unknown where the browser can't say, with an "Ask again" button while it's Off. A refusal shows a note that the browser declined.
- The browser can refuse, and the app works the same either way.
- Persistent storage doesn't protect against clearing site data, uninstalling or changing devices, so the JSON backup is still the backup.

## Screens

1. **Timer:** the routine picker, the running routine and its controls
2. **Routines:** the list, sorting, and editing in place
3. **Stats**
4. **Settings**, with the activity log as a page within it

The app is a single-page app, and each screen has its own URL. Navigation is a bottom tab bar on phones and a top nav on desktop.

## Accessibility

- Every screen works with the keyboard alone. Drag handles are out of the Tab order, since Move up and Move down do the same job.
- A control that disappears when it's pressed hands the keyboard focus on, so it never falls to the page's body: opening a routine for editing focuses its title field, Cancel, Save and a confirmed delete return focus to a control on the Routines screen, and Done on the run summary focuses Play.
- The Timer has a polite live region that says `Overtime`, `Break started`, `Break over` and `Run ended` as the run reaches each, without moving the focus, and never on a tick. The progress bars have the `progressbar` role with their values.
- Text keeps at least 5:1 contrast, and outlines, bars and their tracks at least 3:1, in both themes.

## Deployment

- The source lives in the public GitHub repo `cadoro`, under the MIT license.
- GitHub Actions runs checks on every push and pull request.
- The build's base path comes from an environment variable, so the same code serves from `/cadoro/` on GitHub Pages and from `/` when self-hosted.
- Versions follow semantic versioning from the first deploy, which is 0.1.0. Every merged pull request that changes the app bumps the version and is tagged and released.

### GitHub Pages

- A push to `main` that passes all checks builds the app and deploys it to GitHub Pages with GitHub Actions.
- The app is served at `https://<username>.github.io/cadoro/`, with no custom domain. This is the main copy.
- Pages has no route fallback, so the build provides a `404.html` that starts the app, and refreshing a screen's URL still works.
- Every Pages site under one GitHub account shares the `<username>.github.io` origin, so those sites can read each other's browser storage.

### Self-hosting

- `npm run build` with no base path set gives static files for the root of a site. Any web server can serve them.
- The server must return the app's fallback page for app routes, so refreshing a screen's URL works.
- Off `localhost`, the server needs HTTPS, or the service worker won't run and the app can't be installed.

## Data limitations

These follow from browser-only storage:

- Phone and desktop hold separate data. JSON backup and import is the only way to move it.
- Clearing browser data deletes everything that wasn't backed up.
- Data belongs to the browser and the exact site address. Opening the app at a different address starts with an empty app, so back up first.
- Chimes can't be relied on while the phone is locked or the app is closed, because a static PWA can't run on a schedule without a server.
