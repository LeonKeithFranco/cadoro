// The one way the app reads and saves its data. Each backend, such as IndexedDB through Dexie or
// memory for tests, implements this interface, and one shared suite of tests checks them all.

import type { BackupData } from '../backup-format';
import type { BackupSummary } from '../backup-summary';
import type { LogEntry, NewLogEntry } from '../log';
import type { Routine } from '../routine';
import type { StoredRunInProgress } from '../run-in-progress';
import type { Run, RunRecords, WorkPeriod } from '../run-records';
import type { Settings } from '../settings';

/** What a backend takes from the rest of the app, passed in so tests can control it. */
export type StorageOptions = {
	/**
	 * Returns the current moment, which stamps each log entry and each deletion. `new Date()` when
	 * left out.
	 */
	now?: () => Date;
	/** How many log entries to keep. `LOG_MAX_ENTRIES` (5,000) when left out. */
	logLimit?: number;
};

/**
 * Where the app keeps its data. Every method returns a promise, because the browser's database
 * answers asynchronously.
 *
 * @remarks
 * Named for the app because the browser already has a global `Storage` type, for
 * `localStorage`. Records go in and come out as copies, so changing an object after saving it,
 * or one that was read, never changes what's saved.
 */
export interface CadoroStorage {
	/**
	 * Reads the routines the user can pick, leaving out deleted ones.
	 *
	 * @returns The routines not deleted, in their custom order, lowest `customPosition` first.
	 * @throws Rejects with the backend's own error when its data can't be read, such as when the
	 * browser blocks IndexedDB.
	 */
	getRoutines(): Promise<Routine[]>;

	/**
	 * Reads every routine, deleted ones too, which Stats needs for the names of past work.
	 *
	 * @returns Every routine, lowest `customPosition` first. A deleted routine keeps the position
	 * it had when it was deleted.
	 * @throws Rejects with the backend's own error when its data can't be read.
	 */
	getAllRoutines(): Promise<Routine[]>;

	/**
	 * Follows the routines the user can pick, as {@link CadoroStorage.getRoutines} reads them:
	 * calls `onChange` with them soon after this is called, and again after every change to them,
	 * from this storage object or any other on the same data, as another tab's is.
	 *
	 * @remarks
	 * It reports the same way {@link CadoroStorage.watchRunInProgress} does: always later, never
	 * during this call or a change, with changes in quick succession possibly reported once. Each
	 * report is a complete copy.
	 *
	 * @param onChange - Called with the routines not deleted, in custom order.
	 * @param onError - Called if the routines can't be read.
	 * @returns A function that stops following, after which neither callback is called.
	 */
	watchRoutines(
		onChange: (routines: Routine[]) => void,
		onError: (error: unknown) => void
	): () => void;

	/**
	 * Saves a new routine at its `customPosition` among the routines not deleted, and moves down
	 * those from there on, in one step.
	 *
	 * @remarks
	 * The change is written to the activity log, as every routine change is. A failure to write the
	 * log entry is recorded as an error in the activity log, or written to `console.error` when
	 * the log can't take it, and never undoes or blocks the change.
	 *
	 * @param routine - The routine to add, with an id no routine has, deleted ones included. Its
	 * `customPosition` is the place it goes, and 0 puts it first.
	 * @throws Rejects with an {@link Error} when a routine with that id is saved already, or with
	 * the backend's own error when the data can't be saved, and then nothing is saved.
	 */
	createRoutine(routine: Routine): Promise<void>;

	/**
	 * Saves a copy of a routine just below the routine it copies, moving down those from there on,
	 * in one step, and logs it as a duplicate.
	 *
	 * @param copy - The copy, as `duplicateRoutine` makes it. Its own `customPosition` is ignored.
	 * @param originalId - The id of the routine it copies.
	 * @throws Rejects with an {@link Error} when no routine that isn't deleted has the original's id,
	 * or a routine with the copy's id is saved already, or with the backend's own error when the
	 * data can't be saved, and then nothing is saved.
	 */
	duplicateRoutine(copy: Routine, originalId: string): Promise<void>;

	/**
	 * Saves an edit to a routine's title, rounds and blocks.
	 *
	 * @remarks
	 * The routine's position, creation date and deletion are kept as saved, so an edit worked out
	 * before another tab reordered the routines can't undo the reorder. The log entry holds the old
	 * and new title, rounds and blocks.
	 *
	 * A routine the run in progress is of can't be edited, so a run, ended or not, keeps the
	 * routine it started with until Done forgets it.
	 *
	 * @param routine - The routine as edited, with the id of the routine to change.
	 * @throws Rejects with an {@link Error} when no routine that isn't deleted has that id, or when
	 * it's the routine of the run in progress, or with the backend's own error when the data can't
	 * be saved, and then nothing is saved.
	 */
	saveRoutine(routine: Routine): Promise<void>;

	/**
	 * Deletes a routine by setting its `deletedAt`, unless it's the only routine not deleted.
	 *
	 * @remarks
	 * The routine is kept, so Stats still has its name. It never deletes the last routine left, so
	 * there's always one to run. Nor does it delete the routine of the run in progress, ended or
	 * not, since a restored run needs its routine.
	 *
	 * @param id - The id of the routine to delete.
	 * @returns `true` if the routine was deleted, or `false` if it's the only routine not deleted
	 * and nothing changed.
	 * @throws Rejects with an {@link Error} when no routine that isn't deleted has that id, or when
	 * it's the routine of the run in progress, or with the backend's own error when the data can't
	 * be saved.
	 */
	deleteRoutine(id: string): Promise<boolean>;

	/**
	 * Puts the routines not deleted in a new custom order, saving every changed position in one
	 * step.
	 *
	 * @param orderedIds - The ids of every routine that isn't deleted, in the new order. Each gets
	 * the position of its index, so a gap in the saved positions is closed.
	 * @returns `true` if any position changed, or `false` if the order was already this one, and
	 * nothing was saved or logged.
	 * @throws Rejects with an {@link Error} when the ids aren't exactly those of the routines not
	 * deleted, each once, or with the backend's own error when the data can't be saved, and then no
	 * position changes.
	 */
	reorderRoutines(orderedIds: string[]): Promise<boolean>;

	/**
	 * Reads the activity log.
	 *
	 * @returns The entries, newest first. Only the newest 5,000 are kept.
	 * @throws Rejects with the backend's own error when its data can't be read.
	 */
	getLogEntries(): Promise<LogEntry[]>;

	/**
	 * Adds an entry to the activity log, which keeps only the newest entries: once it holds more
	 * than its limit, the oldest are dropped.
	 *
	 * @remarks
	 * This is how errors are recorded. Routine changes and imports write their own entries, as
	 * part of the change.
	 *
	 * An error that repeats the newest entry, with the same message and the same error name and
	 * message within a minute of its last repeat, isn't added. The newest entry's `details.count` goes up and its
	 * `details.lastTimestamp` is set instead, as `withRepeatCounted` in `log.ts` explains, so a
	 * flood of one error can't push the routine history out of the log.
	 *
	 * @param entry - The entry to add, to which storage gives an id.
	 * @throws Rejects with the backend's own error when the entry can't be written.
	 */
	addLogEntry(entry: NewLogEntry): Promise<void>;

	/**
	 * Saves the given routines, but only if storage holds no routine at all, deleted ones
	 * included.
	 *
	 * @remarks
	 * This is how the starter routines are created on the first launch, and only then. Deleted
	 * routines are kept, so a user who deletes both starters never sees them come back.
	 *
	 * @param routines - The routines to save, each with an id no other routine has.
	 * @returns `true` if storage was empty and the routines were saved, or `false` if it held
	 * routines already and nothing changed.
	 * @throws Rejects with the backend's own error when its data can't be read or saved, and then
	 * nothing is saved.
	 */
	addRoutinesIfNone(routines: Routine[]): Promise<boolean>;

	/**
	 * Saves a change to the run in progress, with what the change leaves to keep: the run's
	 * record, when it starts or ends, and the work periods it ended, all together or not at all,
	 * and only if the saved run in progress is still the one the change was worked out from.
	 *
	 * @remarks
	 * The run in progress replaces the one saved, as there's only ever one. The run's record
	 * replaces any saved run with its id, since a run is saved once when it starts and again when
	 * it ends. Work periods are only ever added, so one can't overwrite another. If anything can't
	 * be saved, nothing from this call is, so a run can't be saved as ended without its last work
	 * period, and a restored run can never end a work period that's already saved.
	 *
	 * Every open tab shares the one run in progress, so the check and the save are one step that
	 * no other tab's save can come between. A tab whose press is refused hasn't yet seen another
	 * tab's change, and saves nothing, so each work period is saved once, by the tab whose press
	 * ended it.
	 *
	 * @param runInProgress - The run in progress as of this change, with a revision of its own.
	 * @param basedOn - The revision of the run in progress the change was worked out from, or
	 * `null` if it was worked out with none saved, as when Play starts a run.
	 * @param records - The run's record, or `null` to leave it as saved, and the work periods to
	 * add. None when left out.
	 * @returns `true` if the change was saved, or `false` if the saved run in progress has another
	 * revision, or none when `basedOn` isn't `null`, and nothing was saved.
	 * @throws Rejects with an {@link Error} when `records.run` is a run not saved yet whose routine
	 * isn't saved, as after an import in another tab replaced the routines, since a backup of
	 * that run would be rejected. Rejects with the backend's own error when a work period's id is
	 * already saved, or when the data can't be saved. Then nothing from this call is saved.
	 */
	saveRunInProgress(
		runInProgress: StoredRunInProgress,
		basedOn: string | null,
		records?: RunRecords
	): Promise<boolean>;

	/**
	 * Moves the run in progress's heartbeat on, as `withHeartbeat` in `run-in-progress.ts`
	 * describes, changing nothing else.
	 *
	 * @param revision - The revision of the run in progress the heartbeat was taken for.
	 * @param heartbeatAt - The heartbeat's moment, as a UTC timestamp.
	 * @returns `true` if the heartbeat was saved, or `false` if it was dropped, because the saved
	 * run in progress has another revision, or none, or a heartbeat that isn't earlier.
	 * @throws Rejects with the backend's own error when the data can't be read or saved.
	 */
	saveHeartbeat(revision: string, heartbeatAt: string): Promise<boolean>;

	/**
	 * Reads the run in progress, to restore it when the app opens.
	 *
	 * @returns The run in progress as last saved, or `null` when none is saved.
	 * @throws Rejects with the backend's own error when its data can't be read.
	 */
	getRunInProgress(): Promise<StoredRunInProgress | null>;

	/**
	 * Follows the run in progress: calls `onChange` with it soon after this is called, and again
	 * after every save that changes it, from this storage object or any other on the same data,
	 * as another tab's is.
	 *
	 * @remarks
	 * `onChange` is always called later, never during this call or a save. A change may be
	 * reported late, after a later save has finished, and changes in quick succession may be
	 * reported once, with the latest, so a caller that needs the latest reads it with
	 * {@link CadoroStorage.getRunInProgress}. Each report is a copy.
	 *
	 * @param onChange - Called with the run in progress as saved, or `null` when none is saved.
	 * @param onError - Called if the run in progress can't be read. A database that can't be
	 * opened at all isn't reported here, since every other read and save fails then too.
	 * @returns A function that stops following, after which neither callback is called.
	 */
	watchRunInProgress(
		onChange: (runInProgress: StoredRunInProgress | null) => void,
		onError: (error: unknown) => void
	): () => void;

	/**
	 * Forgets the run in progress, once its summary is closed, if it's still the one the user
	 * closed. Its run and work periods stay.
	 *
	 * @param basedOn - The revision of the run in progress whose summary was closed.
	 * @returns `true` if it was forgotten, or `false` if the saved run in progress has another
	 * revision, or none is saved, and nothing changed.
	 * @throws Rejects with the backend's own error when the data can't be saved.
	 */
	clearRunInProgress(basedOn: string): Promise<boolean>;

	/**
	 * Reads the settings.
	 *
	 * @returns Every setting, with the default for any the user hasn't changed, or that a saved
	 * row from an earlier version of the app doesn't hold.
	 * @throws Rejects with the backend's own error when its data can't be read.
	 */
	getSettings(): Promise<Settings>;

	/**
	 * Saves changes to the settings, leaving the others as they are.
	 *
	 * @remarks
	 * It merges the changes into what is saved in one step, so two tabs changing different
	 * settings at the same moment keep both. A field that is `undefined` is left as it is.
	 *
	 * @param changes - The settings to change, with their new values.
	 * @throws Rejects with the backend's own error when the data can't be saved, and then nothing
	 * is.
	 */
	saveSettings(changes: Partial<Settings>): Promise<void>;

	/**
	 * Follows the settings: calls `onChange` with them soon after this is called, and again after
	 * every save that changes them, from this storage object or any other on the same data, as
	 * another tab's is.
	 *
	 * @remarks
	 * It reports the same way {@link CadoroStorage.watchRunInProgress} does: always later, never
	 * during this call or a save, with changes in quick succession possibly reported once. Each
	 * report is a complete copy.
	 *
	 * @param onChange - Called with the settings as saved.
	 * @param onError - Called if the settings can't be read.
	 * @returns A function that stops following, after which neither callback is called.
	 */
	watchSettings(
		onChange: (settings: Settings) => void,
		onError: (error: unknown) => void
	): () => void;

	/**
	 * Reads every run, in progress or ended.
	 *
	 * @returns The runs, earliest `startedAt` first.
	 * @throws Rejects with the backend's own error when its data can't be read.
	 */
	getRuns(): Promise<Run[]>;

	/**
	 * Reads every work period.
	 *
	 * @returns The work periods, in the order they started.
	 * @throws Rejects with the backend's own error when its data can't be read.
	 */
	getWorkPeriods(): Promise<WorkPeriod[]>;

	/**
	 * Reads everything a backup holds, in one consistent read.
	 *
	 * @returns Every routine (deleted ones too), run and work period, and all the settings, with
	 * the default for any the user hasn't changed. The run in progress and the activity log aren't
	 * part of a backup.
	 * @throws Rejects with the backend's own error when its data can't be read.
	 */
	readBackupData(): Promise<BackupData>;

	/**
	 * Replaces every routine, run, work period and setting with those of an imported backup, and
	 * forgets the run in progress, in one step.
	 *
	 * @remarks
	 * The run in progress isn't in a backup, and it would refer to a routine that may be gone, so
	 * it's forgotten. The activity log is kept. Once the data is replaced, the import is written to
	 * the log, with the counts in `summary`, as every change is: a failure to write the entry is
	 * recorded as an error in the log, or written to `console.error` when the log can't take it,
	 * and never undoes the import. Everything following the routines,
	 * the settings or the run in progress is told of the change.
	 *
	 * @param data - A valid backup's data, as `parseBackup` checks it.
	 * @param summary - What the backup holds, which the log entry records.
	 * @throws Rejects with an {@link Error} when two routines, runs or work periods share an id, or
	 * with the backend's own error when the data can't be saved, and then nothing changes: the old
	 * data stays as it was, and nothing is logged.
	 */
	replaceAllData(data: BackupData, summary: BackupSummary): Promise<void>;

	/**
	 * Says whether any work period is saved, without reading them all.
	 *
	 * @returns `true` if at least one work period is saved.
	 * @throws Rejects with the backend's own error when its data can't be read.
	 */
	hasWorkPeriods(): Promise<boolean>;
}
