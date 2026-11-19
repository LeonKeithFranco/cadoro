import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { routineWith } from '../testing/routines';
import { runInProgressWith, savedRunInProgress } from '../testing/run-in-progress';
import { DexieStorage } from './dexie-storage';

/**
 * Makes a database name no other test uses.
 *
 * @returns A name starting `test-`, then a UUID.
 */
function newDatabaseName(): string {
	return `test-${crypto.randomUUID()}`;
}

/**
 * Opens a database as it is in the browser, without declaring a schema, the way a later version
 * of the app would find it.
 *
 * @param name - The database's name in the browser.
 * @returns The opened database, whose version and tables are those saved in the browser.
 */
async function openAsSaved(name: string): Promise<Dexie> {
	const database = new Dexie(name);
	await database.open();
	return database;
}

describe('DexieStorage', () => {
	it('keeps routines after the database is opened again, as after a reload', async () => {
		const name = newDatabaseName();
		await new DexieStorage(name).addRoutinesIfNone([routineWith({ id: 'kept' })]);

		const reopened = new DexieStorage(name);

		expect(await reopened.getRoutines()).toEqual([routineWith({ id: 'kept' })]);
	});

	it('adds routines once when two connections try at the same moment, as two tabs opening at once', async () => {
		const name = newDatabaseName();
		const firstTab = new DexieStorage(name);
		const secondTab = new DexieStorage(name);

		const added = await Promise.all([
			firstTab.addRoutinesIfNone([routineWith({ id: 'first-tab' })]),
			secondTab.addRoutinesIfNone([routineWith({ id: 'second-tab' })])
		]);

		expect(added.toSorted()).toEqual([false, true]);
		expect(await firstTab.getRoutines()).toHaveLength(1);
	});

	it('creates schema version 1, with every table the spec defines, each with its key', async () => {
		const name = newDatabaseName();
		await new DexieStorage(name).getRoutines();

		const saved = await openAsSaved(name);
		// IndexedDB's own stores, since Dexie reports a key kept outside the row as `''`, which
		// would also be the key path of a row that is its own key. IndexedDB lists them by name.
		const database = saved.backendDB();
		const storeNames = [...database.objectStoreNames];
		const transaction = database.transaction(storeNames);
		const keyPaths = storeNames.map((store) => [store, transaction.objectStore(store).keyPath]);

		expect(saved.verno).toBe(1);
		expect(keyPaths).toEqual([
			['routines', 'id'],
			['runInProgress', null],
			['runs', 'id'],
			['workPeriods', 'id']
		]);
	});

	it('keeps the run in progress after the database is opened again, as after a reload', async () => {
		const name = newDatabaseName();
		await new DexieStorage(name).saveRunInProgress(savedRunInProgress);

		const reopened = new DexieStorage(name);

		expect(await reopened.getRunInProgress()).toEqual(savedRunInProgress);
	});

	it('keeps the run in progress as one row, under the key current, however often it’s saved', async () => {
		const name = newDatabaseName();
		const storage = new DexieStorage(name);
		await storage.saveRunInProgress(savedRunInProgress);
		const later = runInProgressWith({ heartbeatAt: '2026-11-19T09:10:01.000Z' });
		await storage.saveRunInProgress(later);

		const saved = await openAsSaved(name);

		expect(await saved.table('runInProgress').toCollection().primaryKeys()).toEqual(['current']);
		expect(await saved.table('runInProgress').get('current')).toEqual(later);
	});

	it('keeps the app’s data in the database named cadoro', async () => {
		await new DexieStorage().addRoutinesIfNone([routineWith({ id: 'in-cadoro' })]);

		const saved = await openAsSaved('cadoro');

		expect(await saved.table('routines').toArray()).toEqual([routineWith({ id: 'in-cadoro' })]);
	});
});
