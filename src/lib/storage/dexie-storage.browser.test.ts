import Dexie from 'dexie';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { routineWith } from '../testing/routines';
import { runInProgressWith, savedRunInProgress } from '../testing/run-in-progress';
import { firstWorkPeriod, runInProgress, workPeriodWith } from '../testing/run-records';
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
	// Puts back what a test replaced, such as IndexedDB's `open`.
	afterEach(() => {
		vi.restoreAllMocks();
	});

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

	it('creates schema version 2, with every table the spec defines, each with its key', async () => {
		const name = newDatabaseName();
		await new DexieStorage(name).getRoutines();

		const saved = await openAsSaved(name);
		// IndexedDB's own stores, since Dexie reports a key kept outside the row as `''`, which
		// would also be the key path of a row that is its own key. IndexedDB lists them by name.
		const database = saved.backendDB();
		const storeNames = [...database.objectStoreNames];
		const transaction = database.transaction(storeNames);
		const keyPaths = storeNames.map((store) => [store, transaction.objectStore(store).keyPath]);

		expect(saved.verno).toBe(2);
		expect(keyPaths).toEqual([
			['routines', 'id'],
			['runInProgress', null],
			['runs', 'id'],
			['workPeriods', 'id']
		]);
	});

	it('upgrades a version-1 database, giving its run in progress a revision and keeping every row', async () => {
		const name = newDatabaseName();
		const version1 = new Dexie(name);
		// Version 1's schema as 0.5 declared it, written out here so a change to the app's can't
		// change what this test starts from.
		version1
			.version(1)
			.stores({ routines: 'id', runs: 'id', workPeriods: 'id', runInProgress: '' });
		// The row as version 1 saved it, with no revision.
		const version1Row = {
			record: savedRunInProgress.record,
			run: savedRunInProgress.run,
			heartbeatAt: savedRunInProgress.heartbeatAt
		};
		await version1.table('routines').add(routineWith({ id: 'kept' }));
		await version1.table('runs').add(runInProgress);
		await version1.table('workPeriods').add(firstWorkPeriod);
		await version1.table('runInProgress').put(version1Row, 'current');
		version1.close();

		const upgraded = new DexieStorage(name);

		expect(await upgraded.getRunInProgress()).toEqual({ ...version1Row, revision: 'version-1' });
		expect(await upgraded.getRoutines()).toEqual([routineWith({ id: 'kept' })]);
		expect(await upgraded.getRuns()).toEqual([runInProgress]);
		expect(await upgraded.getWorkPeriods()).toEqual([firstWorkPeriod]);
		expect((await openAsSaved(name)).verno).toBe(2);
	});

	it('upgrades a version-1 database with no run in progress, leaving it with none', async () => {
		const name = newDatabaseName();
		const version1 = new Dexie(name);
		version1
			.version(1)
			.stores({ routines: 'id', runs: 'id', workPeriods: 'id', runInProgress: '' });
		await version1.table('routines').add(routineWith({ id: 'kept' }));
		version1.close();

		const upgraded = new DexieStorage(name);

		expect(await upgraded.getRunInProgress()).toBeNull();
		expect(await upgraded.getRoutines()).toEqual([routineWith({ id: 'kept' })]);
	});

	it('keeps the run in progress after the database is opened again, as after a reload', async () => {
		const name = newDatabaseName();
		await new DexieStorage(name).saveRunInProgress(savedRunInProgress, null);

		const reopened = new DexieStorage(name);

		expect(await reopened.getRunInProgress()).toEqual(savedRunInProgress);
	});

	it('keeps the run in progress as one row, under the key current, however often it’s saved', async () => {
		const name = newDatabaseName();
		const storage = new DexieStorage(name);
		await storage.saveRunInProgress(savedRunInProgress, null);
		const later = runInProgressWith({ heartbeatAt: '2026-11-19T09:10:01.000Z' });
		await storage.saveRunInProgress(later, 'revision-1');

		const saved = await openAsSaved(name);

		expect(await saved.table('runInProgress').toCollection().primaryKeys()).toEqual(['current']);
		expect(await saved.table('runInProgress').get('current')).toEqual(later);
	});

	it('saves only one of two changes from two connections worked out from the same revision, as two tabs pressing at once', async () => {
		const name = newDatabaseName();
		const firstTab = new DexieStorage(name);
		const secondTab = new DexieStorage(name);
		await firstTab.saveRunInProgress(savedRunInProgress, null);

		const saved = await Promise.all([
			firstTab.saveRunInProgress(runInProgressWith({ revision: 'first-tab' }), 'revision-1', {
				run: null,
				workPeriods: [workPeriodWith({ id: 'first-tab-period' })]
			}),
			secondTab.saveRunInProgress(runInProgressWith({ revision: 'second-tab' }), 'revision-1', {
				run: null,
				workPeriods: [workPeriodWith({ id: 'second-tab-period' })]
			})
		]);

		expect(saved.toSorted()).toEqual([false, true]);
		expect(await firstTab.getWorkPeriods()).toHaveLength(1);
	});

	it('reports a save made through another connection, as another tab’s', async () => {
		const name = newDatabaseName();
		const firstTab = new DexieStorage(name);
		const secondTab = new DexieStorage(name);
		const reports: unknown[] = [];
		firstTab.watchRunInProgress(
			(runInProgress) => reports.push(runInProgress),
			() => {}
		);
		await expect.poll(() => reports).toEqual([null]);

		await secondTab.saveRunInProgress(savedRunInProgress, null);

		await expect.poll(() => reports.at(-1)).toEqual(savedRunInProgress);
	});

	it('reports an error, and no run, when the run in progress can’t be read', async () => {
		const storage = new DexieStorage(newDatabaseName());
		await storage.getRunInProgress();
		// A test can't make the disk fail, so IndexedDB's read throws instead. Dexie's live query
		// doesn't report a database that failed to open, as it waits for it to open again.
		vi.spyOn(IDBObjectStore.prototype, 'get').mockImplementation(() => {
			throw new DOMException('The disk could not be read.', 'UnknownError');
		});
		const onChange = vi.fn();
		const onError = vi.fn();

		storage.watchRunInProgress(onChange, onError);

		await expect.poll(() => onError).toHaveBeenCalledOnce();
		expect(onChange).not.toHaveBeenCalled();
	});

	it('keeps the app’s data in the database named cadoro', async () => {
		await new DexieStorage().addRoutinesIfNone([routineWith({ id: 'in-cadoro' })]);

		const saved = await openAsSaved('cadoro');

		expect(await saved.table('routines').toArray()).toEqual([routineWith({ id: 'in-cadoro' })]);
	});
});
