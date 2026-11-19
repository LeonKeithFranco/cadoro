// A backend that keeps data in memory, for tests of the code that uses storage. Data lasts only
// as long as the object.

import type { Routine } from '../routine';
import type { CadoroStorage } from './storage';

/**
 * Storage kept in memory, which starts empty and is lost when the object goes.
 *
 * @remarks
 * Routines are copied in and out with `structuredClone`, as IndexedDB copies everything it
 * saves, so tests against this backend can't pass by sharing objects with the code they check.
 */
export class InMemoryStorage implements CadoroStorage {
	/** Every routine saved, deleted ones included, in the order they were added. */
	#routines: Routine[] = [];

	async getRoutines(): Promise<Routine[]> {
		const shown = this.#routines.filter((routine) => routine.deletedAt === null);
		const inCustomOrder = shown.toSorted((a, b) => a.customPosition - b.customPosition);
		return structuredClone(inCustomOrder);
	}

	async addRoutinesIfNone(routines: Routine[]): Promise<boolean> {
		if (this.#routines.length > 0) {
			return false;
		}

		this.#routines = structuredClone(routines);
		return true;
	}
}
