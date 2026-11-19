# Decisions: milestone 8, Backup and activity log

CSV export, the JSON backup and import, the activity log page, and recording errors. One branch, released as 0.10.0, built in packages. The rules themselves are in `docs/SPEC.md`, and the plan in `docs/PLAN.md`.

## Backup and activity log (`feat/backup-and-log`), 2026-11-19

### The files

- The backup leaves out the run in progress, since the spec's list doesn't include it and it could name a routine the backup lacks. Import forgets the run in progress for the same reason.
- No byte order mark in the CSV, so the file is plain UTF-8 that any tool reads the same.
- File names use the user's local day, since the day is for them to tell files apart. Times inside the files stay UTC.
- The import's summary shows local days too, as the project rule is to work out local days only when showing them. It first showed UTC days, which was changed in `fix(backup)`.
- A work period's `blockId` may name a block the routine no longer has, because editing a routine can remove blocks, so import accepts it and the CSV gives an empty block title.
- `parseBackup` returns `{ ok, backup }` or `{ ok: false, message }` rather than throwing, since an invalid file is an expected outcome that the screen shows. The readers in `backup-fields.ts` throw an `InvalidBackupError` with the field's path, and `parseBackup` catches it.
- Import checks the same limits as the Routines screen by calling `validateRoutine`, so a backup can't bring in a routine the app couldn't make.

### Storage

- `readBackupData` reads in one transaction, so a backup is one consistent moment. `replaceAllData` replaces everything in one transaction and aborts with nothing changed on a repeated id.
- The import's log entry is written after the replace, in its own transaction, as every change's is, so a failed log write can't undo the import. `importLogEntry` is in its own module so both backends write the same entry.
- A round-trip test makes runs through the real engine and `recordPress`, checks the backup passes `parseBackup`, and imports it into a fresh storage as equal data.

### Errors

- `recordError(message, error)` never throws. If the log can't take the entry, or storage isn't open yet, it falls back to `console.error`, so an error handler can't cause an error of its own, and an early error isn't lost.
- `useErrorLog(storage)` in the root layout's `load` chooses the log, instead of passing storage to every place that reports an error, so each call stays `recordError(message, error)`.
- `src/hooks.client.ts` records the errors SvelteKit catches and doesn't record 404s, which aren't the app's errors.
- `ErrorBoundary` is a `<svelte:boundary>` around the layout's content, with Try again, so one broken screen doesn't leave a blank page. Event handler errors aren't caught by boundaries, so the global handlers take them.
- All 14 `console.error` sites that reported milestone 4 to 6 failures became log entries, each with a test.

### The Settings screen

- The log page loads once and doesn't update live, so entries don't shift under the reader's eyes. A reload or a return to the page shows new ones.
- The pending import is held in `$state.raw`, because a `$state` proxy can't be cloned into IndexedDB.
- The log page's heading had a `new` icon that made the dev server reload the page mid-journey, so the icon was dropped.

### Testing

- `e2e/backup.spec.ts` backs up in one browser context and restores into a fresh one with everything intact, rejects an invalid file, and shows a routine edit and an import in the log. It passed 40 of 40.
- The import summary's test is pinned to `America/New_York`, where the UTC and local days differ, with `src/lib/testing/time-zone.ts`, the same module the Stats tests use.
