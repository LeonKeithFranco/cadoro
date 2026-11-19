// The one way the app reads and saves its data. Each backend, such as IndexedDB through Dexie or
// memory for tests, implements this interface, and one shared suite of tests checks them all.

import type { Routine } from '../routine';
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
	 * Saves what a button press leaves to save: the run, when it starts or ends, and the work
	 * periods it ended, all together or not at all.
	 *
	 * @remarks
	 * The run replaces any saved run with its id, since a run is saved once when it starts and
	 * again when it ends. Work periods are only ever added, so one can't overwrite another. If
	 * anything can't be saved, nothing from this call is, so a run can't be saved as ended
	 * without its last work period.
	 *
	 * @param records - The run, or `null` to leave it as saved, and the work periods to add.
	 * @throws Rejects with the backend's own error when a work period's id is already saved, or
	 * when the data can't be saved, and then nothing from this call is saved.
	 */
	saveRunRecords(records: RunRecords): Promise<void>;

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
