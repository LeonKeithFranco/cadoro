// The one way the app reads and saves its data. Each backend, such as IndexedDB through Dexie or
// memory for tests, implements this interface, and one shared suite of tests checks them all.

import type { Routine } from '../routine';
import type { StoredRunInProgress } from '../run-in-progress';
import type { Run, RunRecords, WorkPeriod } from '../run-records';

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
	 * @throws Rejects with the backend's own error when a work period's id is already saved, or
	 * when the data can't be saved, and then nothing from this call is saved.
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
	 * Says whether any work period is saved, without reading them all.
	 *
	 * @returns `true` if at least one work period is saved.
	 * @throws Rejects with the backend's own error when its data can't be read.
	 */
	hasWorkPeriods(): Promise<boolean>;
}
