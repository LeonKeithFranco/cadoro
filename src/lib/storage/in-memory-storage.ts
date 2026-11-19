// A backend that keeps data in memory, for tests of the code that uses storage. Data lasts only
// as long as the object.

import { pickableRoutines, type Routine } from '../routine';
import {
	runsOldestFirst,
	workPeriodsOldestFirst,
	type Run,
	type RunRecords,
	type WorkPeriod
} from '../run-records';
import type { CadoroStorage } from './storage';

/**
 * Storage kept in memory, which starts empty and is lost when the object goes.
 *
 * @remarks
 * Records are copied in and out with `structuredClone`, as IndexedDB copies everything it saves,
 * so tests against this backend can't pass by sharing objects with the code they check.
 */
export class InMemoryStorage implements CadoroStorage {
	/** Every routine saved, deleted ones included, in the order they were added. */
	#routines: Routine[] = [];

	/** Every run saved, by id. */
	#runs = new Map<string, Run>();

	/** Every work period saved, by id. */
	#workPeriods = new Map<string, WorkPeriod>();

	async getRoutines(): Promise<Routine[]> {
		return structuredClone(pickableRoutines(this.#routines));
	}

	async addRoutinesIfNone(routines: Routine[]): Promise<boolean> {
		if (this.#routines.length > 0) {
			return false;
		}

		this.#routines = structuredClone(routines);
		return true;
	}

	async saveRunRecords(records: RunRecords): Promise<void> {
		// Every check comes before any change, so a rejected call saves nothing, as a rolled-back
		// transaction does in IndexedDB.
		const newIds = new Set<string>();
		for (const period of records.workPeriods) {
			if (this.#workPeriods.has(period.id) || newIds.has(period.id)) {
				throw new Error(`A work period with id ${period.id} is already saved.`);
			}
			newIds.add(period.id);
		}

		if (records.run !== null) {
			this.#runs.set(records.run.id, structuredClone(records.run));
		}
		for (const period of records.workPeriods) {
			this.#workPeriods.set(period.id, structuredClone(period));
		}
	}

	async getRuns(): Promise<Run[]> {
		return structuredClone(runsOldestFirst([...this.#runs.values()]));
	}

	async getWorkPeriods(): Promise<WorkPeriod[]> {
		return structuredClone(workPeriodsOldestFirst([...this.#workPeriods.values()]));
	}

	async hasWorkPeriods(): Promise<boolean> {
		return this.#workPeriods.size > 0;
	}
}
