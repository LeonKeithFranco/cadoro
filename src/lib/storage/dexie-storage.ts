// The app's storage: the browser's IndexedDB, through Dexie, which wraps IndexedDB's events in
// promises and gives each table a typed API.

import Dexie, { type EntityTable } from 'dexie';
import { pickableRoutines, type Routine } from '../routine';
import type { CadoroStorage } from './storage';

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
 * The database, with a type for each table the code reads and saves so far.
 *
 * @remarks
 * Dexie adds a property for each table when the schema is declared, which TypeScript can't see,
 * so this type names them, as Dexie's docs do. The other tables get their types when their
 * records do.
 */
type CadoroDatabase = Dexie & {
	/** Every routine, deleted ones included, keyed by its `id`. */
	routines: EntityTable<Routine, 'id'>;
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

	/**
	 * Connects to the database, which opens on the first read or write.
	 *
	 * @param name - The database's name in the browser. Tests give each storage a name of its
	 * own, so none sees another's data.
	 */
	constructor(name: string = DATABASE_NAME) {
		this.#database = connect(name);
	}

	async getRoutines(): Promise<Routine[]> {
		const routines = await this.#database.routines.toArray();
		return pickableRoutines(routines);
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
}
