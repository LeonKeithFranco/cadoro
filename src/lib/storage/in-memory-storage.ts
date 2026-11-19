// A backend that keeps data in memory, for tests of the code that uses storage. Data lasts only
// as long as the object.

import { pickableRoutines, type Routine } from '../routine';
import { isRevision, withHeartbeat, type StoredRunInProgress } from '../run-in-progress';
import {
	noRecords,
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
 * so tests against this backend can't pass by sharing objects with the code they check. Two
 * sessions given the same object stand for two tabs, each told of the other's changes.
 */
export class InMemoryStorage implements CadoroStorage {
	/** Every routine saved, deleted ones included, in the order they were added. */
	#routines: Routine[] = [];

	/** Every run saved, by id. */
	#runs = new Map<string, Run>();

	/** Every work period saved, by id. */
	#workPeriods = new Map<string, WorkPeriod>();

	/** The run in progress, or `null` when none is saved. */
	#runInProgress: StoredRunInProgress | null = null;

	/** The `onChange` of everything following the run in progress. */
	#watchers = new Set<(runInProgress: StoredRunInProgress | null) => void>();

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

	async saveRunInProgress(
		runInProgress: StoredRunInProgress,
		basedOn: string | null,
		records: RunRecords = noRecords()
	): Promise<boolean> {
		if (!isRevision(this.#runInProgress, basedOn)) {
			return false;
		}

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
		this.#changeRunInProgress(runInProgress);
		return true;
	}

	async saveHeartbeat(revision: string, heartbeatAt: string): Promise<boolean> {
		const changed = withHeartbeat(this.#runInProgress, revision, heartbeatAt);
		if (changed === null) {
			return false;
		}

		this.#changeRunInProgress(changed);
		return true;
	}

	async getRunInProgress(): Promise<StoredRunInProgress | null> {
		return structuredClone(this.#runInProgress);
	}

	// It takes no `onError`, since memory can always be read.
	watchRunInProgress(onChange: (runInProgress: StoredRunInProgress | null) => void): () => void {
		this.#watchers.add(onChange);
		this.#report(onChange);
		return (): void => {
			this.#watchers.delete(onChange);
		};
	}

	async clearRunInProgress(basedOn: string): Promise<boolean> {
		if (!isRevision(this.#runInProgress, basedOn)) {
			return false;
		}

		this.#changeRunInProgress(null);
		return true;
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

	/**
	 * Replaces the run in progress, and tells everything following it.
	 *
	 * @param runInProgress - The new run in progress, or `null` to forget it.
	 */
	#changeRunInProgress(runInProgress: StoredRunInProgress | null): void {
		this.#runInProgress = structuredClone(runInProgress);
		for (const watcher of this.#watchers) {
			this.#report(watcher);
		}
	}

	/**
	 * Tells one follower the run in progress, once the current call has finished, as IndexedDB's
	 * live queries answer later too.
	 *
	 * @remarks
	 * It reports the run in progress as it is when the report is made, so changes in quick
	 * succession may be reported with the latest more than once. A follower that has stopped
	 * following by then isn't told.
	 *
	 * @param watcher - The follower's `onChange`.
	 */
	#report(watcher: (runInProgress: StoredRunInProgress | null) => void): void {
		queueMicrotask(() => {
			if (this.#watchers.has(watcher)) {
				watcher(structuredClone(this.#runInProgress));
			}
		});
	}
}
