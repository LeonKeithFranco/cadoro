# Decisions: milestone 7, Stats

The Stats screen: today's work, the daily chart, weekly, monthly and all-time totals, streaks, the target figures and the routine filter. One branch, released as 0.9.0, built in packages. The rules the screen follows are in `docs/SPEC.md`, under Stats, and the plan in `docs/PLAN.md`.

## Stats (`feat/stats`), 2026-11-19

### Pure logic

- The logic is split by what each module knows: `day-slices.ts` is the only place that works out local days, and `work-totals.ts`, `stats-range.ts`, `streaks.ts`, `target-stats.ts` and `routine-stats.ts` take its slices or the work periods. `stats-view.ts` only picks their numbers and writes them as text.
- Work is split into slices from each period's unpaused segments, not its start and end, so paused time never counts.
- `date-fns` does the calendar arithmetic, so a day with a daylight saving change is 23 or 25 hours long, not a fixed 24.
- Rejected: `@date-fns/tz`, to run the tests in a chosen zone. It isn't installed, so the tests pin Node's own zone with `process.env.TZ` instead, through `src/lib/testing/time-zone.ts`, imported first. A test of the zone itself fails if Node ever stops re-reading `TZ`.
- The tests' zone is New York, which has daylight saving, and they check a period across midnight and across a clock change against hand-calculated values.
- Time against target and targets reached are `null` with no work periods, shown as "-", since nothing is a percentage of no target. "Reached" means worked at least the target.
- Per-routine totals skip routines with no work and ignore a routine that can't be found, whose work still counts in the overall total.
- Streaks use local days, and work later than today counts for the longest streak but not the current one.

### The Stats screen

- LayerChart's `BarChart` draws the daily chart, as the plan chose, inside an `aria-hidden` element. Its text alternative is a visually hidden table named "Work time per day", a row for each day, which the tests also read, so a screen reader gets every day's value.
- The chart has a bar for every day of its range, zeros included, while the weekly and monthly lists show only buckets with work.
- Weekly and monthly lists are newest first, the opposite of the logic's oldest-first order, since the latest is what a reader wants. `viewStats` reverses them.
- Percentages are rounded to whole numbers, in the view only, so the modules keep full precision.
- The route's `load` reads the routines and work periods each time the screen is opened, so the screen shows work saved since it was last open. It doesn't follow storage live, since opening Stats pauses the run in every tab, so little changes while the screen is open.
- The layout's `load` already returns `storage`, so the page reads through it with `parent()`.
- The routine filter lists every routine, deleted ones included, since their work is in the stats. Deleted routines are labelled "(deleted)" both in the filter and in all time per routine, through `routineLabel`, so the label is written once. The filter first listed them by plain title, which was fixed before the docs round.
- Stats reads `getAllRoutines`, which milestone 6 added, since `getRoutines` leaves deleted routines out.
- The empty state replaces the screen only when no work is saved at all. A routine with no work shows zeros and "No work yet." lists, so the filter stays usable.

### The journeys

- `e2e/stats.spec.ts` runs two routines on the fake clock and follows their work into Stats: the figures, the table, the filter and the presets. It passed 10 of 10 repeats.
- The visual check fixed the range buttons' sizing, the bars' outline in light mode and empty space in the Monthly card.
- One `go-task check` run had a flaky end-to-end failure that passed on rerun.
