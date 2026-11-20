// A backend that keeps data in memory, for tests of the code that uses storage. Data lasts only
// as long as the object.

import type { BackupData } from '../backup-format';
import { importLogEntry } from '../backup-log';
import type { BackupSummary } from '../backup-summary';
import { LOG_MAX_ENTRIES, withRepeatCounted, type LogEntry, type NewLogEntry } from '../log';
import { inCustomOrder, pickableRoutines, type Routine } from '../routine';
import {
	planCreate,
	planDelete,
	planDuplicate,
	planReorder,
	planSave,
	type RoutineChange
} from '../routine-changes';
import { isRevision, withHeartbeat, type StoredRunInProgress } from '../run-in-progress';
import {
	noRecords,
	requireRoutineOfNewRun,
	runsOldestFirst,
	workPeriodsOldestFirst,
	type Run,
	type RunRecords,
	type WorkPeriod
} from '../run-records';
import {
	settingsDifferingFromDefaults,
	settingsFrom,
	settingsWithChanges,
	type Settings
} from '../settings';
import type { CadoroStorage, StorageOptions } from './storage';

/**
 * The followers of one kind of data, told what it is when they start following and after each
 * change.
 *
 * @typeParam T - What a follower is told: the data as it is when the report is made.
 */
class Watchers<T> {
	/** The `onChange` of everything following the data. */
	#followers = new Set<(value: T) => void>();

	/** Reads the data as a follower should be told it, as a copy. */
	readonly #read: () => T;

	/**
	 * Makes a set of followers with none.
	 *
	 * @param read - Reads the data as a follower should be told it, as a copy.
	 */
	constructor(read: () => T) {
		this.#read = read;
	}

	/**
	 * Adds a follower and tells it what the data is, once the current call has finished.
	 *
	 * @param onChange - The follower's `onChange`.
	 * @returns A function that stops the follower.
	 */
	follow(onChange: (value: T) => void): () => void {
		this.#followers.add(onChange);
		this.#report(onChange);
		return (): void => {
			this.#followers.delete(onChange);
		};
	}

	/** Tells every follower what the data is now. */
	reportAll(): void {
		for (const follower of this.#followers) {
			this.#report(follower);
		}
	}

	/**
	 * Tells one follower what the data is, once the current call has finished, as IndexedDB's
	 * live queries answer later too.
	 *
	 * @remarks
	 * It reports the data as it is when the report is made, so changes in quick succession may be
	 * reported with the latest more than once. A follower that has stopped following by then isn't
	 * told.
	 *
	 * @param follower - The follower's `onChange`.
	 */
	#report(follower: (value: T) => void): void {
		queueMicrotask(() => {
			if (this.#followers.has(follower)) {
				follower(this.#read());
			}
		});
	}
}

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

	/** Everything following the run in progress. */
	#watchers = new Watchers<StoredRunInProgress | null>(() => structuredClone(this.#runInProgress));

	/** The settings the user has changed, or `null` when none has been. */
	#settings: Partial<Settings> | null = null;

	/** Everything following the settings. */
	#settingsWatchers = new Watchers<Settings>(() => settingsFrom(structuredClone(this.#settings)));

	/** Returns the current moment, which stamps each log entry and each deletion. */
	readonly #now: () => Date;

	/** How many log entries are kept. */
	readonly #logLimit: number;

	/** The log's entries, oldest first. */
	#log: LogEntry[] = [];

	/** The id the next log entry gets. */
	#nextLogId = 1;

	/** Everything following the routines not deleted. */
	#routineWatchers = new Watchers<Routine[]>(() =>
		structuredClone(pickableRoutines(this.#routines))
	);

	/**
	 * Makes empty storage.
	 *
	 * @param options - The clock and the log's size, as {@link StorageOptions} describes them.
	 */
	constructor({ now = (): Date => new Date(), logLimit = LOG_MAX_ENTRIES }: StorageOptions = {}) {
		this.#now = now;
		this.#logLimit = logLimit;
	}

	async getRoutines(): Promise<Routine[]> {
		return structuredClone(pickableRoutines(this.#routines));
	}

	async getAllRoutines(): Promise<Routine[]> {
		return structuredClone(inCustomOrder(this.#routines));
	}

	// It takes no `onError`, since memory can always be read.
	watchRoutines(onChange: (routines: Routine[]) => void): () => void {
		return this.#routineWatchers.follow(onChange);
	}

	async createRoutine(routine: Routine): Promise<void> {
		this.#apply(planCreate(this.#routines, structuredClone(routine), this.#now()));
	}

	async duplicateRoutine(copy: Routine, originalId: string): Promise<void> {
		this.#apply(planDuplicate(this.#routines, structuredClone(copy), originalId, this.#now()));
	}

	async saveRoutine(routine: Routine): Promise<void> {
		const runningRoutineId = this.#runInProgress?.record.routineId ?? null;
		this.#apply(planSave(this.#routines, structuredClone(routine), this.#now(), runningRoutineId));
	}

	async deleteRoutine(id: string): Promise<boolean> {
		const runningRoutineId = this.#runInProgress?.record.routineId ?? null;
		const change = planDelete(this.#routines, id, this.#now(), runningRoutineId);
		if (change === null) {
			return false;
		}

		this.#apply(change);
		return true;
	}

	async reorderRoutines(orderedIds: string[]): Promise<boolean> {
		const change = planReorder(this.#routines, orderedIds, this.#now());
		if (change === null) {
			return false;
		}

		this.#apply(change);
		return true;
	}

	async getLogEntries(): Promise<LogEntry[]> {
		return structuredClone(this.#log.toReversed());
	}

	async addLogEntry(entry: NewLogEntry): Promise<void> {
		const newest = this.#log.at(-1);
		const counted = withRepeatCounted(newest, structuredClone(entry));
		if (counted !== null) {
			this.#log[this.#log.length - 1] = counted;
			return;
		}

		this.#appendLog(structuredClone(entry));
	}

	async addRoutinesIfNone(routines: Routine[]): Promise<boolean> {
		if (this.#routines.length > 0) {
			return false;
		}

		this.#routines = structuredClone(routines);
		this.#routineWatchers.reportAll();
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
		if (records.run !== null && !this.#runs.has(records.run.id)) {
			requireRoutineOfNewRun(new Set(this.#routines.map((routine) => routine.id)), records.run);
		}
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
		return this.#watchers.follow(onChange);
	}

	async clearRunInProgress(basedOn: string): Promise<boolean> {
		if (!isRevision(this.#runInProgress, basedOn)) {
			return false;
		}

		this.#changeRunInProgress(null);
		return true;
	}

	async getSettings(): Promise<Settings> {
		return settingsFrom(structuredClone(this.#settings));
	}

	async saveSettings(changes: Partial<Settings>): Promise<void> {
		this.#settings = structuredClone(settingsWithChanges(this.#settings, changes));
		this.#settingsWatchers.reportAll();
	}

	// It takes no `onError`, since memory can always be read.
	watchSettings(onChange: (settings: Settings) => void): () => void {
		return this.#settingsWatchers.follow(onChange);
	}

	async getRuns(): Promise<Run[]> {
		return structuredClone(runsOldestFirst([...this.#runs.values()]));
	}

	async getWorkPeriods(): Promise<WorkPeriod[]> {
		return structuredClone(workPeriodsOldestFirst([...this.#workPeriods.values()]));
	}

	async readBackupData(): Promise<BackupData> {
		return {
			routines: await this.getAllRoutines(),
			runs: await this.getRuns(),
			workPeriods: await this.getWorkPeriods(),
			settings: await this.getSettings()
		};
	}

	async replaceAllData(data: BackupData, summary: BackupSummary): Promise<void> {
		// Every check comes before any change, so a rejected import changes nothing, as an aborted
		// transaction does in IndexedDB.
		for (const [name, records] of [
			['routine', data.routines],
			['run', data.runs],
			['work period', data.workPeriods]
		] as const) {
			const ids = records.map((record) => record.id);
			if (new Set(ids).size !== ids.length) {
				throw new Error(`Two ${name}s in the import share an id.`);
			}
		}

		this.#routines = structuredClone(data.routines);
		this.#runs = new Map(structuredClone(data.runs).map((run) => [run.id, run]));
		this.#workPeriods = new Map(
			structuredClone(data.workPeriods).map((period) => [period.id, period])
		);
		this.#settings = settingsDifferingFromDefaults(data.settings);
		this.#changeRunInProgress(null);
		this.#routineWatchers.reportAll();
		this.#settingsWatchers.reportAll();

		this.#appendLog(importLogEntry(summary, this.#now()));
	}

	async hasWorkPeriods(): Promise<boolean> {
		return this.#workPeriods.size > 0;
	}

	/**
	 * Saves a routine change and its log entry, and tells everything following the routines.
	 *
	 * @param change - What to save and log, from `routine-changes.ts`.
	 */
	#apply(change: RoutineChange): void {
		for (const written of structuredClone(change.writes)) {
			const index = this.#routines.findIndex((routine) => routine.id === written.id);
			if (index === -1) {
				this.#routines.push(written);
			} else {
				this.#routines[index] = written;
			}
		}

		this.#appendLog(structuredClone(change.entry));
		this.#routineWatchers.reportAll();
	}

	/**
	 * Adds an entry to the end of the log, numbering it, and drops the oldest entries beyond the
	 * log's limit.
	 *
	 * @param entry - The entry to add, which the log keeps as it is, so it must be a copy.
	 */
	#appendLog(entry: NewLogEntry): void {
		this.#log.push({ id: this.#nextLogId, ...entry });
		this.#nextLogId += 1;
		this.#log = this.#log.slice(-this.#logLimit);
	}

	/**
	 * Replaces the run in progress, and tells everything following it.
	 *
	 * @param runInProgress - The new run in progress, or `null` to forget it.
	 */
	#changeRunInProgress(runInProgress: StoredRunInProgress | null): void {
		this.#runInProgress = structuredClone(runInProgress);
		this.#watchers.reportAll();
	}
}
