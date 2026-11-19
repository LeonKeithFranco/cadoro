# Decisions: milestone 6, Routines

The Routines screen, editing routines and blocks in place, the activity log of routine changes, and the Timer following the sort and pinning its controls. One branch, released as 0.8.0, built in packages. The rules themselves are in `docs/SPEC.md`, and the plan in `docs/PLAN.md`.

## Routines (`feat/routines`), 2026-11-19

### Pure logic

- Titles are trimmed before the 1 to 50 check, and a title of only spaces is blank. They're saved trimmed.
- A routine's only block must have 1 cycle, and `validateRoutine` reports it, rather than the form silently fixing it. Deleting blocks down to one resets the cycles to 1 through `resetSingleBlockCycles`.
- Sort ties fall back to custom order, so every sort is a total order and the list never jumps between renders. Last used is the latest run's `startedAt`, with never-used routines last. Most work sums `workedMs`.
- A copy's title is cut to fit 50 characters with the suffix, so a duplicate is always valid.
- A block's copy keeps every field and goes just below the original. A new block is titled "Focus", the same 25 minutes at 20% for 1 cycle as a new routine's block.
- `insertRoutine` renumbers every position to 0 to n-1, with a new routine at 0 and a copy at the original's position plus 1, so gaps never build up. (This entry first said so, and it was wrong: a delete only sets `deletedAt` and leaves a gap in the positions until the next create, duplicate or reorder renumbers them. The copy's place is the original's index among the routines not deleted, which `planDuplicate` finds, not its `customPosition` plus 1.)
- The moves of a list are one generic `list-order.ts`, and routines and blocks call it, so dragging and the Move buttons share one rule.

### Storage and the log

- Dexie schema version 4 adds the `log` table. It starts empty, so there's no data-moving upgrade function, as with version 3.
- `routine-changes.ts` plans each change as a pure function, the routines to write and the log entry, and both backends apply the plan, so the rules are written once.
- A log entry is `{ id, timestamp, type: 'change', message, details }`, with `details.action` one of create, edit, duplicate, delete or reorder, and the old and new values for an edit.
- The entry is written in its own transaction after the change, so a failed log write is reported with `console.error` and can't undo the change. The spec says a log failure never blocks a data change, which one shared transaction couldn't promise.
- `getAllRoutines` reads the deleted routines too, since Stats needs their names, which `getRoutines` leaves out. `watchRoutines` follows the routines not deleted.
- `saveRoutine` keeps the saved position, creation date and deletion, so an edit made before another tab reordered can't undo the reorder.
- `deleteRoutine` returns `false` for the last routine, and `reorderRoutines` returns `false` when nothing would change, so neither logs. `duplicateRoutine` takes the original's id, so storage places the copy.
- This settles the open item about deleting every routine: the last one can't be deleted, in storage and in the UI, so `TimerSession` always has one.
- `TimerSession` follows `watchRoutines`. A ready run takes its routine's new version, or the first routine if it was deleted. A run that has started keeps the routine it started with, which it carries in its plan.
- "The first routine", when there's no last routine or it's deleted, means the picker's first, which follows the chosen sort, as the spec says. The first version took the first in custom order. `TimerSession` takes a `pickerOrder` option, and the layout passes `sortRoutines` with the saved sort and the runs read as the app opened, so the "last used" and "most work" sorts are as of opening. Giving the session the sort and a live usage was rejected: it would make the session follow the settings and every run too, for a fallback.
- `RoutineUsage` needs only the runs and work periods, not a whole storage, so the sorts are pure and tests build it by hand.

### The Routines screen

- Save on an unchanged routine closes the form and writes nothing, so it adds no log entry.
- "Unsaved" and "unchanged" compare the titles trimmed, as they're saved (`withTrimmedTitles`), so spaces alone don't prompt "Discard changes?" or write a log entry whose old and new values match.
- When another tab deletes the routine being edited, the screen closes its form and shows a notice, since `editing` would otherwise stay set with no form to show, asking "Discard changes?" about nothing. When another tab changes its title, rounds or blocks, the form stays, with a notice that Save will overwrite that change: the user's work isn't thrown away, and storage's `saveRoutine` keeps the last write, so the notice is the only warning. A reorder alone says nothing.
- While a routine is open, the list isn't a drag zone, because `svelte-dnd-action` shares its handle state across zones.
- Leaving by a link with unsaved changes asks "Discard changes?" in `beforeNavigate`, cancels the navigation, and carries on with `goto(resolve(route))` once confirmed.
- The layout's `load` now returns `storage`, so the screen edits through the same storage object as everything else.
- The sort is the `routineSort` setting that milestone 5 added, so no new storage was needed.

### The running routine

- Edit and Delete are disabled on the routine of the run in progress, in any tab, with a hint. The Routines screen reads the shared run, so a run another tab starts locks it too. Save is disabled if the run starts mid-edit, with a line saying why, and a delete confirmed after that is ignored.
- This is in the UI only, with no guard in storage. Restoring a run whose routine was deleted forgets the run, which is why the screen has to stop it. Storage has no guard for it, so a caller that skips the screen could still edit or delete the routine, and that's a known limit.
- The lock also holds while an ended run's summary is open, through `TimerSession.heldRoutineId`, which is the routine of any run that isn't ready. The first version locked only while the run was in progress, so a routine could be deleted with its summary open, and a reload then forgot the run and lost the summary, against the spec. Restoring a run from all routines, deleted ones included, was rejected: it would need every restore and follow path to read `getAllRoutines`, and a run of a deleted routine in the picker's state, for a window of a few seconds; keeping the lock until the summary is closed is one line in the page.

### Timer changes

- The picker follows the sort with `sortRoutines` in `TimerScreen`, so the Timer and the Routines screen always agree.
- The controls are pinned with `position: sticky` at the bottom of the window, above the phone's tab bar, as `03-pwa-and-github-pages.md` planned, and the active block scrolls into view with a scroll margin that clears them. The box reaches down under the tab bar, so no sliver of a block shows between them, and carries the page's background so the blocks scrolling under don't show through.

### Tooling

- `optimizeDeps.include` for `svelte-dnd-action`, `layerchart` and `date-fns`, top-level in `vite.config.ts`. A cold dev server found these only when a lazily loaded screen imported them, re-bundled and reloaded the page mid-journey, which failed a test. Listing them was proven on cold runs.
- Component tests that check layout, the sticky controls and the scroll, import `layout.css`, because the classes do nothing without Tailwind's stylesheet.

### Testing

- `e2e/routines.spec.ts` covers creating, editing, reordering and deleting a routine, building a multi-block routine and running it as configured, the discard prompt, and the last routine's Delete. Reordering uses a real mouse drag.
- It passed 240 of 240 repeats.
