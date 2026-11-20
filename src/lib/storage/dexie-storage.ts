// The app's storage: the browser's IndexedDB, through Dexie, which wraps IndexedDB's events in
// promises and gives each table a typed API.

import Dexie, { liveQuery, type EntityTable, type Table, type Transaction } from 'dexie';
import type { BackupData } from '../backup-format';
import { importLogEntry } from '../backup-log';
import type { BackupSummary } from '../backup-summary';
import { recordErrorIn } from '../error-log';
import { LOG_MAX_ENTRIES, type LogEntry, type NewLogEntry } from '../log';
import { pickableRoutines, type Routine } from '../routine';
import {
	planCreate,
	planDelete,
	planDuplicate,
	planReorder,
	planSave,
	type RoutineChange
} from '../routine-changes';
import {
	isRevision,
	VERSION_1_REVISION,
	withHeartbeat,
	type StoredRunInProgress
} from '../run-in-progress';
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
import { writeThemeMirror } from './theme-mirror';

/**
 * The database's name in the browser. Renaming it would leave every user's data behind in the
 * old database, so it never changes.
 */
const DATABASE_NAME = 'cadoro';

/**
 * The tables of schema version 1, in Dexie's schema strings, where each string names the primary
 * key and then any indexes.
 *
 * @remarks
 * Version 1 declares every table milestone 4 uses, as the spec's data model defines them, even
 * those no code reads yet. Each version deploys to devices that keep their data, so adding a
 * table later takes a new version. A change after this one, such as an index for stats, goes in
 * a new `version(2)` with an upgrade, while this one stays as it is.
 */
const SCHEMA_VERSION_1 = {
	/** Every routine, deleted ones included, keyed by its `id`. */
	routines: 'id',
	/** Every run, keyed by its `id`. */
	runs: 'id',
	/** Every work period, keyed by its `id`. */
	workPeriods: 'id',
	/**
	 * The one run in progress. The empty string keeps the key outside the row, so the row is the
	 * run exactly as the engine has it, saved under a fixed key.
	 */
	runInProgress: ''
};

/**
 * The key the one run in progress is saved under. Saved data uses it, so it never changes.
 */
const RUN_IN_PROGRESS_KEY = 'current';

/**
 * The tables schema version 3 adds to version 2's, which Dexie keeps as they are.
 *
 * @remarks
 * Version 3 gives the user's settings a table of their own.
 */
const SCHEMA_VERSION_3_ADDS = {
	/**
	 * The one row of settings the user has changed, saved under {@link SETTINGS_KEY}, with the
	 * key kept outside the row like `runInProgress`'s.
	 */
	settings: ''
};

/**
 * The key the one settings row is saved under. Saved data uses it, so it never changes.
 */
const SETTINGS_KEY = 'current';

/**
 * The tables schema version 4 adds to version 3's, which Dexie keeps as they are.
 *
 * @remarks
 * Version 4 gives the activity log a table of its own.
 */
const SCHEMA_VERSION_4_ADDS = {
	/**
	 * The activity log's entries, keyed by an `id` that counts up by itself, so the primary key is
	 * the order they were written in and needs no index of its own.
	 */
	log: '++id'
};

/** The run in progress as schema version 1 saved it, before it had a revision. */
type Version1RunInProgress = Omit<StoredRunInProgress, 'revision'> & {
	/** Missing from every row version 1 saved, and set by version 2's upgrade. */
	revision?: string;
};

/**
 * Upgrades a database saved by schema version 1 to version 2, which gives the run in progress
 * its revision. Dexie runs it once, when a version-2 app first opens a version-1 database, and
 * no tab can read or save until it has finished.
 *
 * @param transaction - The upgrade's own transaction, over every table.
 * @throws Rejects with IndexedDB's error when the row can't be read or saved, and then the
 * database stays at version 1 and the app can't open it.
 */
async function upgradeToVersion2(transaction: Transaction): Promise<void> {
	await transaction
		.table<Version1RunInProgress, string>('runInProgress')
		.toCollection()
		.modify((row) => {
			row.revision = VERSION_1_REVISION;
		});
}

/**
 * The database, with a type for each table.
 *
 * @remarks
 * Dexie adds a property for each table when the schema is declared, which TypeScript can't see,
 * so this type names them, as Dexie's docs do.
 */
type CadoroDatabase = Dexie & {
	/** Every routine, deleted ones included, keyed by its `id`. */
	routines: EntityTable<Routine, 'id'>;
	/** Every run, keyed by its `id`. */
	runs: EntityTable<Run, 'id'>;
	/** Every work period, keyed by its `id`. */
	workPeriods: EntityTable<WorkPeriod, 'id'>;
	/**
	 * The one run in progress, under {@link RUN_IN_PROGRESS_KEY}. `Table` rather than
	 * `EntityTable`, since its key isn't a field of the row.
	 */
	runInProgress: Table<StoredRunInProgress, string>;
	/**
	 * The one settings row, under {@link SETTINGS_KEY}, holding only the settings the user has
	 * changed. `Table`, since its key isn't a field of the row.
	 */
	settings: Table<Partial<Settings>, string>;
	/** The activity log's entries, keyed by their counting-up `id`. */
	log: EntityTable<LogEntry, 'id'>;
};

/**
 * Makes a connection to the database, declaring its schema. Dexie opens it on the first read or
 * write, creating it then if it doesn't exist.
 *
 * @param name - The database's name in the browser.
 * @returns The database, not yet opened.
 */
function connect(name: string): CadoroDatabase {
	const database = new Dexie(name) as CadoroDatabase;
	database.version(1).stores(SCHEMA_VERSION_1);
	// Version 2 keeps every table and key as version 1 has them, which the empty `stores` says:
	// without it, Dexie would take version 2 to have no tables and delete them all.
	database.version(2).stores({}).upgrade(upgradeToVersion2);
	// Version 3 adds the `settings` table. Dexie creates a new table by itself when it upgrades,
	// and an absent row means every setting has its default, so no data needs moving.
	database.version(3).stores(SCHEMA_VERSION_3_ADDS);
	// Version 4 adds the `log` table. It starts empty, so no data needs moving.
	database.version(4).stores(SCHEMA_VERSION_4_ADDS);
	return database;
}

/**
 * Storage in the browser's IndexedDB, which keeps its data across reloads and restarts.
 *
 * @remarks
 * IndexedDB saves a copy of each object and reads give new ones, so routines go in and come out
 * as copies without any copying here.
 */
export class DexieStorage implements CadoroStorage {
	/** The connection every method goes through. */
	#database: CadoroDatabase;

	/** Returns the current moment, which stamps each log entry and each deletion. */
	readonly #now: () => Date;

	/** How many log entries are kept. */
	readonly #logLimit: number;

	/**
	 * Connects to the database, which opens on the first read or write.
	 *
	 * @param name - The database's name in the browser. Tests give each storage a name of its
	 * own, so none sees another's data.
	 * @param options - The clock and the log's size, as {@link StorageOptions} describes them.
	 */
	constructor(
		name: string = DATABASE_NAME,
		{ now = (): Date => new Date(), logLimit = LOG_MAX_ENTRIES }: StorageOptions = {}
	) {
		this.#database = connect(name);
		this.#now = now;
		this.#logLimit = logLimit;
	}

	async getRoutines(): Promise<Routine[]> {
		const routines = await this.#database.routines.toArray();
		return pickableRoutines(routines);
	}

	async getAllRoutines(): Promise<Routine[]> {
		const routines = await this.#database.routines.toArray();
		return routines.toSorted((a, b) => a.customPosition - b.customPosition);
	}

	watchRoutines(
		onChange: (routines: Routine[]) => void,
		onError: (error: unknown) => void
	): () => void {
		const table = this.#database.routines;
		const subscription = liveQuery(() => table.toArray()).subscribe({
			next: (routines) => {
				onChange(pickableRoutines(routines));
			},
			error: onError
		});
		return (): void => {
			subscription.unsubscribe();
		};
	}

	async createRoutine(routine: Routine): Promise<void> {
		await this.#changeRoutines((routines) => planCreate(routines, routine, this.#now()));
	}

	async duplicateRoutine(copy: Routine, originalId: string): Promise<void> {
		await this.#changeRoutines((routines) =>
			planDuplicate(routines, copy, originalId, this.#now())
		);
	}

	async saveRoutine(routine: Routine): Promise<void> {
		await this.#changeRoutines((routines, runningRoutineId) =>
			planSave(routines, routine, this.#now(), runningRoutineId)
		);
	}

	async deleteRoutine(id: string): Promise<boolean> {
		const change = await this.#changeRoutines((routines, runningRoutineId) =>
			planDelete(routines, id, this.#now(), runningRoutineId)
		);
		return change !== null;
	}

	async reorderRoutines(orderedIds: string[]): Promise<boolean> {
		const change = await this.#changeRoutines((routines) =>
			planReorder(routines, orderedIds, this.#now())
		);
		return change !== null;
	}

	async getLogEntries(): Promise<LogEntry[]> {
		return this.#database.log.reverse().toArray();
	}

	/**
	 * Saves a change to the routines, then writes its log entry.
	 *
	 * @remarks
	 * The routines are read and saved in one read-write transaction, so two tabs changing them at
	 * once each plan against the routines the other left. The log entry is written afterwards, in
	 * a transaction of its own, since an entry that couldn't be written must never undo the change
	 * or stop it, as the spec says. A failed log write is recorded as an
	 * error entry through `recordErrorIn`, which writes to `console.error` when the log can't take
	 * even that.
	 *
	 * The run in progress is read in the same transaction, so a plan can refuse a change to the
	 * routine that run is of.
	 *
	 * @param plan - Works out the change from every routine saved and the id of the routine of the
	 * run in progress, or `null` when none is saved, or returns `null` for no change.
	 * @returns The change that was saved, or `null` when the plan found nothing to change.
	 * @throws Rejects with the plan's error, or IndexedDB's when the routines can't be read or
	 * saved, and then nothing is saved and nothing is logged.
	 */
	async #changeRoutines(
		plan: (routines: Routine[], runningRoutineId: string | null) => RoutineChange | null
	): Promise<RoutineChange | null> {
		const table = this.#database.routines;
		const runInProgressTable = this.#database.runInProgress;
		const change = await this.#database.transaction('rw', [table, runInProgressTable], async () => {
			const running = await runInProgressTable.get(RUN_IN_PROGRESS_KEY);
			const planned = plan(await table.toArray(), running?.record.routineId ?? null);
			if (planned !== null) {
				await table.bulkPut(planned.writes);
			}
			return planned;
		});

		if (change !== null) {
			await this.#writeLogEntry(change.entry);
		}
		return change;
	}

	/**
	 * Adds an entry to the log and drops the oldest entries beyond the log's limit, in one
	 * transaction.
	 *
	 * @param entry - What to add, to which storage gives an id.
	 * @returns A promise that settles once the entry is written, or has failed. It never rejects.
	 */
	async #writeLogEntry(entry: NewLogEntry): Promise<void> {
		try {
			await this.addLogEntry(entry);
		} catch (error) {
			// Recorded as an error entry if the log can still take one, else on the console.
			await recordErrorIn(this, 'Writing to the activity log failed.', error, this.#now());
		}
	}

	async addLogEntry(entry: NewLogEntry): Promise<void> {
		const log = this.#database.log;
		await this.#database.transaction('rw', log, async () => {
			await log.add(entry);
			const excess = (await log.count()) - this.#logLimit;
			if (excess > 0) {
				// The primary key counts up, so the first keys are the oldest entries.
				await log.bulkDelete(await log.limit(excess).primaryKeys());
			}
		});
	}

	async addRoutinesIfNone(routines: Routine[]): Promise<boolean> {
		const table = this.#database.routines;

		// One read-write transaction for the count and the add, so two tabs opening the app for the
		// first time can't both find storage empty and both add the starter routines. IndexedDB
		// runs read-write transactions on the same table one after another.
		return this.#database.transaction('rw', table, async () => {
			if ((await table.count()) > 0) {
				return false;
			}

			await table.bulkAdd(routines);
			return true;
		});
	}

	async saveRunInProgress(
		runInProgress: StoredRunInProgress,
		basedOn: string | null,
		records: RunRecords = noRecords()
	): Promise<boolean> {
		const { runInProgress: runInProgressTable, runs, workPeriods, routines } = this.#database;

		// One read-write transaction across the four tables, so the revision is checked and the
		// run in progress, the run and its work periods are saved together or not at all.
		// IndexedDB runs read-write transactions on the same tables one after another, even across
		// tabs, so no other tab's save can come between the check and the writes. A failed
		// `bulkAdd` that isn't caught aborts the transaction, as Dexie's docs say, which undoes
		// both `put`s too. Outside a transaction, the others would stay saved.
		return this.#database.transaction(
			'rw',
			[runInProgressTable, runs, workPeriods, routines],
			async () => {
				const saved = await runInProgressTable.get(RUN_IN_PROGRESS_KEY);
				if (!isRevision(saved ?? null, basedOn)) {
					return false;
				}
				// A run saved again as it ends has its routine checked as it starts, not again.
				if (records.run !== null && (await runs.get(records.run.id)) === undefined) {
					requireRoutineOfNewRun(new Set(await routines.toCollection().primaryKeys()), records.run);
				}

				// The key is given, since it isn't a field of the row.
				await runInProgressTable.put(runInProgress, RUN_IN_PROGRESS_KEY);
				if (records.run !== null) {
					// `put` adds the run or replaces it, as it's saved again when it ends.
					await runs.put(records.run);
				}
				// `bulkAdd` refuses an id that's already saved, so a work period is never overwritten.
				await workPeriods.bulkAdd(records.workPeriods);
				return true;
			}
		);
	}

	async saveHeartbeat(revision: string, heartbeatAt: string): Promise<boolean> {
		const table = this.#database.runInProgress;

		// One read-write transaction, so no other tab's save can come between reading the row and
		// saving its new heartbeat.
		return this.#database.transaction('rw', table, async () => {
			const saved = await table.get(RUN_IN_PROGRESS_KEY);
			const changed = withHeartbeat(saved ?? null, revision, heartbeatAt);
			if (changed === null) {
				return false;
			}

			await table.put(changed, RUN_IN_PROGRESS_KEY);
			return true;
		});
	}

	async getRunInProgress(): Promise<StoredRunInProgress | null> {
		const runInProgress = await this.#database.runInProgress.get(RUN_IN_PROGRESS_KEY);
		return runInProgress ?? null;
	}

	watchRunInProgress(
		onChange: (runInProgress: StoredRunInProgress | null) => void,
		onError: (error: unknown) => void
	): () => void {
		const table = this.#database.runInProgress;
		// Dexie runs the query again whenever a save changes the row, from this connection or,
		// through a `BroadcastChannel`, another tab's.
		const subscription = liveQuery(() => table.get(RUN_IN_PROGRESS_KEY)).subscribe({
			next: (runInProgress) => {
				onChange(runInProgress ?? null);
			},
			error: onError
		});
		return (): void => {
			subscription.unsubscribe();
		};
	}

	async clearRunInProgress(basedOn: string): Promise<boolean> {
		const table = this.#database.runInProgress;

		// One read-write transaction, so the row checked is the row deleted.
		return this.#database.transaction('rw', table, async () => {
			const saved = await table.get(RUN_IN_PROGRESS_KEY);
			if (!isRevision(saved ?? null, basedOn)) {
				return false;
			}

			await table.delete(RUN_IN_PROGRESS_KEY);
			return true;
		});
	}

	async getSettings(): Promise<Settings> {
		const settings = settingsFrom((await this.#database.settings.get(SETTINGS_KEY)) ?? null);
		// Every read refreshes the mirror, so it's made even for a user whose settings were saved
		// before the mirror existed.
		writeThemeMirror(settings.theme);
		return settings;
	}

	async saveSettings(changes: Partial<Settings>): Promise<void> {
		const table = this.#database.settings;

		// One read-write transaction, so two tabs saving different settings at once keep both.
		const row = await this.#database.transaction('rw', table, async () => {
			const changed = settingsWithChanges((await table.get(SETTINGS_KEY)) ?? null, changes);
			await table.put(changed, SETTINGS_KEY);
			return changed;
		});
		// After the save, so a failed one leaves the mirror as it was.
		writeThemeMirror(settingsFrom(row).theme);
	}

	watchSettings(
		onChange: (settings: Settings) => void,
		onError: (error: unknown) => void
	): () => void {
		const table = this.#database.settings;
		const subscription = liveQuery(() => table.get(SETTINGS_KEY)).subscribe({
			next: (row) => {
				const settings = settingsFrom(row ?? null);
				writeThemeMirror(settings.theme);
				onChange(settings);
			},
			error: onError
		});
		return (): void => {
			subscription.unsubscribe();
		};
	}

	async getRuns(): Promise<Run[]> {
		const runs = await this.#database.runs.toArray();
		return runsOldestFirst(runs);
	}

	async getWorkPeriods(): Promise<WorkPeriod[]> {
		const periods = await this.#database.workPeriods.toArray();
		return workPeriodsOldestFirst(periods);
	}

	async readBackupData(): Promise<BackupData> {
		const { routines, runs, workPeriods, settings } = this.#database;

		// One read transaction over the four tables, so a backup never mixes data from before and
		// after another tab's save.
		return this.#database.transaction('r', [routines, runs, workPeriods, settings], async () => ({
			routines: (await routines.toArray()).toSorted((a, b) => a.customPosition - b.customPosition),
			runs: runsOldestFirst(await runs.toArray()),
			workPeriods: workPeriodsOldestFirst(await workPeriods.toArray()),
			settings: settingsFrom((await settings.get(SETTINGS_KEY)) ?? null)
		}));
	}

	async replaceAllData(data: BackupData, summary: BackupSummary): Promise<void> {
		const { routines, runs, workPeriods, settings, runInProgress } = this.#database;

		// One read-write transaction over every table the backup replaces. If `bulkAdd` refuses a
		// repeated id, the error aborts the transaction, which undoes the `clear`s too, so the old
		// data stays.
		await this.#database.transaction(
			'rw',
			[routines, runs, workPeriods, settings, runInProgress],
			async () => {
				await Promise.all([
					routines.clear(),
					runs.clear(),
					workPeriods.clear(),
					settings.clear(),
					runInProgress.clear()
				]);
				await routines.bulkAdd(data.routines);
				await runs.bulkAdd(data.runs);
				await workPeriods.bulkAdd(data.workPeriods);
				await settings.put(settingsDifferingFromDefaults(data.settings), SETTINGS_KEY);
			}
		);
		// After the replace, so a failed one leaves the mirror as it was.
		writeThemeMirror(data.settings.theme);
		await this.#writeLogEntry(importLogEntry(summary, this.#now()));
	}

	async hasWorkPeriods(): Promise<boolean> {
		// IndexedDB counts the rows itself, so none is copied out to be counted.
		return (await this.#database.workPeriods.count()) > 0;
	}
}
