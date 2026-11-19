// The one way the app reads and saves its data. Each backend, such as IndexedDB through Dexie or
// memory for tests, implements this interface, and one shared suite of tests checks them all.

import type { Routine } from '../routine';

/**
 * Where the app keeps its data. Every method returns a promise, because the browser's database
 * answers asynchronously.
 *
 * @remarks
 * Named for the app because the browser already has a global `Storage` type, for
 * `localStorage`. Routines go in and come out as copies, so changing an object after saving it,
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
}
