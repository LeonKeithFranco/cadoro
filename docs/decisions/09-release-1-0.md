# Decisions: milestone 9, Release 1.0

The test coverage audit and the release itself, shipped together as 1.0.0 in one pull request. The rules are in `docs/SPEC.md`, and the plan in `docs/PLAN.md`.

## The test coverage audit (`test/coverage-audit`), 2026-11-19

### How the audit ran

- A one-off Vitest `--coverage` run across both projects, with `@vitest/coverage-v8` installed as a dev dependency at Vitest's version. It has no threshold and no task, script or CI step: the report finds gaps, and isn't a goal.
- Two fresh read-only reviewers, one walking the SPEC and the other ARCHITECTURE's invariants and the decision log, named for each rule, edge case, journey and failure the test that would catch it breaking, or reported it missing. They also reported tests that can't fail. Gaps were then filled by area: logic, storage, components and journeys.
- A test that exposed a bug became a fix, with its regression test seen failing first. No test was loosened.
- **Shipped inside 1.0.0:** the audit would have been 0.10.1 if a bug fix changed the app, and merged with no bump if not. It found bugs, but the user decided that milestone 9's branch starts from the audit's tip, so one pull request ships both as 1.0.0, with one review and one merge. Two pull requests were rejected as a second review and merge for no separate release.

### Tests that couldn't fail, and gaps

- The scroll and theme-colour tests could pass without the behaviour, so they were made able to fail. The accent-sort test couldn't catch `sensitivity: 'base'` being dropped, so it now checks that `Eclair` and `Éclair` tie.
- Tests were added for the engine's buttons never changing the run they're given, two connections saving different settings, the chime's allowed drift, the root layout, the activity log page reading once, failed duplicate, delete and move, Save over another tab's edit, the manifest and service worker's scope under the base path, an unreadable backup file, heartbeats causing no Stats re-read, and the pinned controls above the phone's tab bar.

### Bugs the audit found

- **A chime's check lived on the Timer's tick.** A tab away from the Timer screen got no ticks, so after the laptop slept it could play a chime late while another tab ran the work. `RunChimes` now checks on an interval of its own, on every screen.
- **The fallback routine and the picker sorted differently.** The root layout sorted the fallback routine with the runs read at launch while the picker reloaded them. `RoutineUsageKeeper` now holds the usage once, and both sort with it.
- **Save lost a changed-elsewhere warning.** `save()` rebuilt the form from a copy taken before its `await`, so a warning set during a failed save vanished. It now builds from the form as it is.
- **Stats could show stale data.** Two re-reads resolving out of order left older work periods on screen, and after a failed re-read the next heartbeat swapped in the new run, so the ended period vanished. Reads are numbered, only the latest shows, and the old run stays until a read succeeds.
- **The running routine's lock was in the UI only.** Storage now refuses to edit or delete the routine of the run in progress, an ended run's included until Done. The alternative of leaving the UI as the only guard was rejected, since another tab or screen could bypass it.
- **A run could start on an unsaved routine.** A tab that pressed Play before its routines watch delivered an import's routines saved a run that made every later backup fail. Storage refuses a new run whose routine isn't saved (unless it holds no routines at all), and the backup's error names the run. A lenient parse was rejected, since a backup should stay strict.
  - **Changed later:** the exception was never in the code. Storage with no routines refuses too, and a test locks it in, so tests use storage that already holds their runs' routines, in [Guardrails](#guardrails).
- **A repeating error could flood the log.** An identical error directly after the same error, within a minute, now adds to the newest entry's `details.count` rather than making an entry, matching on the message, the error name and the error message. Rate-limiting across all errors was rejected, since it would hide different errors.
- **A failed Duplicate, Delete or Move told the user nothing.** It now shows a short message above the list, as a failed Save does, and a failed Move puts the routines back.

### Guardrails

- ESLint now enforces the invariants, so they can't come back: only `src/lib/storage/` imports Dexie or uses `indexedDB`, only `theme-mirror.ts` uses `localStorage`, only `error-log.ts` writes to the console, and the pure engine and logic modules import nothing from Svelte or a component and never read the clock.
- `src/lib/testing/storage.ts` gives tests storage that already holds their runs' routines, since storage now refuses a run whose routine it doesn't hold. `routineId` is always required when a new run is saved.
- The unused `onTick` option of `TimerSession` and the unused `ScreenPlaceholder` component were removed.

## The release (`docs/release-1-0`), 2026-11-19

### The spec sweep

- The sweep walked the SPEC against the app and found no gap, only wording. The SPEC was tidied: heartbeats run every second while a timer counts, not "while the app is open"; persistent storage is asked for once per launch; history and process text (the weight tracker, the original sketch, the Testing section, the Web Push exception, the Optional section) was removed; the locked-phone limit and the open items were each stated once; and the "all stats come from saved work periods" line now says the work period in progress counts too.
- The cycles example was clarified, the running-routine rules split into bullets, and tab sharing given its own section, "Several tabs".
- The SPEC states the pre-1.0 fixes: the storage guards, the collapsed repeated errors, the failed Duplicate, Delete or Move message, the live region and the focus rules.

### Accessibility fixes

- A read-only audit of every screen at desktop and phone sizes, in both themes, found seven things, all fixed.
- **Outlines:** controls and cards had borders under 3:1 (`zinc-300` on white 1.48:1, `zinc-200` 1.27:1, dark `zinc-700` 1.91:1, the dark card borders 1.34:1). WCAG 1.4.11 asks 3:1, so every control, button, dialog and card border is `zinc-500` in both themes, and the progress bar's track gets the same outline. Only separators stay paler. A test measures the painted colours.
- **Live region:** the Timer has a polite `status` region that says Overtime, Break started, Break over and Run ended, and never on a tick, so a screen reader hears them without the focus moving (WCAG 4.1.3). The bars have the `progressbar` role with values.
- **Focus:** it fell to the body after Edit, Cancel, a confirmed delete and Done on the summary. It now moves into the form's title, back to the routine's Edit button or its neighbour's, and to Play.
- **Drag handles** are out of the Tab order, with noisy text from `svelte-dnd-action`, since Move up and Move down cover the keyboard.
- **The chart:** its axis labels were 10px and are larger, and the range presets fit on one row on a Pixel 7, with "All" no longer alone on a second.

### Node stays on 22

- The plan's step to move `.nvmrc` and `@types/node` to the current LTS was dropped on the user's word: Fedora's `nodejs` is 22 and CI follows `.nvmrc`, so moving would test a Node the machine doesn't run. Node 22 is supported until April 2027, so it stays an open item until Fedora ships a newer one.

### The README and the self-host check

- The README is practical only: what the app is, installing and using it, the data limits, self-hosting, development, releasing and credits, with no build story. The history stays in this folder.
- The self-host check built with no base path, served `build/` from a static server with a fallback page and followed only the README. Its result is in the pull request.

### Device checks for 1.0

Nothing here blocks the release. They need a real device, so they're listed rather than waited on:

- A backup made on one device imports into another.
- Dragging routines and blocks by touch on the phone, and the pinned controls above the tab bar on a long routine.
- Killing the installed app mid-run and reopening it finds the run paused at about the moment it was left.
- A chime plays on time in a background desktop tab.
- The phone's screen stays on during a run.
- The four chimes sound right by ear.
- Keyboard use and a screen reader on the Timer's live region and on the focus moves.
