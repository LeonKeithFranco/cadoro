import Dexie from 'dexie';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { routineWith } from '../testing/routines';
import { runInProgressWith, savedRunInProgress } from '../testing/run-in-progress';
import { firstWorkPeriod, runInProgress, runWith, workPeriodWith } from '../testing/run-records';
import { DEFAULT_SETTINGS, type Settings } from '../settings';
import { DexieStorage } from './dexie-storage';
import { THEME_MIRROR_KEY } from './theme-mirror';

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

	it('upgrades a version-2 database, adding the settings table and keeping every row', async () => {
		const name = newDatabaseName();
		const version2 = new Dexie(name);
		// Version 2's schema as 0.6 declared it, written out here so a change to the app's can't
		// change what this test starts from.
		version2
			.version(1)
			.stores({ routines: 'id', runs: 'id', workPeriods: 'id', runInProgress: '' });
		version2.version(2).stores({});
		await version2.table('routines').add(routineWith({ id: 'kept' }));
		await version2.table('runs').add(runInProgress);
		await version2.table('workPeriods').add(firstWorkPeriod);
		await version2.table('runInProgress').put(savedRunInProgress, 'current');
		version2.close();

		const upgraded = new DexieStorage(name);

		expect(await upgraded.getSettings()).toEqual(DEFAULT_SETTINGS);
		await upgraded.saveSettings({ volume: 10 });
		expect((await upgraded.getSettings()).volume).toBe(10);
		expect(await upgraded.getRoutines()).toEqual([routineWith({ id: 'kept' })]);
		expect(await upgraded.getRuns()).toEqual([runInProgress]);
		expect(await upgraded.getWorkPeriods()).toEqual([firstWorkPeriod]);
		expect(await upgraded.getRunInProgress()).toEqual(savedRunInProgress);
		expect((await openAsSaved(name)).verno).toBe(4);
	});

	it('upgrades a version-3 database, adding the log table and keeping every row', async () => {
		const name = newDatabaseName();
		const version3 = new Dexie(name);
		// Version 3's schema as 0.7 declared it, written out here so a change to the app's can't
		// change what this test starts from.
		version3
			.version(1)
			.stores({ routines: 'id', runs: 'id', workPeriods: 'id', runInProgress: '' });
		version3.version(2).stores({});
		version3.version(3).stores({ settings: '' });
		await version3.table('routines').add(routineWith({ id: 'kept' }));
		await version3.table('runs').add(runInProgress);
		await version3.table('workPeriods').add(firstWorkPeriod);
		await version3.table('runInProgress').put(savedRunInProgress, 'current');
		await version3.table('settings').put({ volume: 10 }, 'current');
		version3.close();

		const upgraded = new DexieStorage(name, {
			now: (): Date => new Date('2026-11-19T10:00:00.000Z')
		});

		expect(await upgraded.getLogEntries()).toEqual([]);
		await upgraded.saveRoutine(routineWith({ id: 'kept', title: 'Edited' }));
		const [entry] = await upgraded.getLogEntries();
		expect(entry?.id).toBe(1);
		expect(entry?.message).toBe('Edited routine "Edited"');
		expect(await upgraded.getAllRoutines()).toEqual([routineWith({ id: 'kept', title: 'Edited' })]);
		expect((await upgraded.getSettings()).volume).toBe(10);
		expect(await upgraded.getRuns()).toEqual([runInProgress]);
		expect(await upgraded.getWorkPeriods()).toEqual([firstWorkPeriod]);
		expect(await upgraded.getRunInProgress()).toEqual(savedRunInProgress);
		expect((await openAsSaved(name)).verno).toBe(4);
	});

	it('creates schema version 4, with every table the spec defines, each with its key', async () => {
		const name = newDatabaseName();
		await new DexieStorage(name).getRoutines();

		const saved = await openAsSaved(name);
		// IndexedDB's own stores, since Dexie reports a key kept outside the row as `''`, which
		// would also be the key path of a row that is its own key. IndexedDB lists them by name.
		const database = saved.backendDB();
		const storeNames = [...database.objectStoreNames];
		const transaction = database.transaction(storeNames);
		const keyPaths = storeNames.map((store) => [store, transaction.objectStore(store).keyPath]);

		expect(saved.verno).toBe(4);
		expect(keyPaths).toEqual([
			['log', 'id'],
			['routines', 'id'],
			['runInProgress', null],
			['runs', 'id'],
			['settings', null],
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
		expect((await openAsSaved(name)).verno).toBe(4);
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

	it('reports a settings save made through another connection, as another tab’s', async () => {
		const name = newDatabaseName();
		const firstTab = new DexieStorage(name);
		const secondTab = new DexieStorage(name);
		const reports: Settings[] = [];
		firstTab.watchSettings(
			(settings) => reports.push(settings),
			() => {}
		);
		await expect.poll(() => reports).toHaveLength(1);

		await secondTab.saveSettings({ volume: 5 });

		await expect.poll(() => reports.at(-1)?.volume).toBe(5);
	});

	it('reports an error, and no settings, when the settings can’t be read', async () => {
		const storage = new DexieStorage(newDatabaseName());
		await storage.getSettings();
		vi.spyOn(IDBObjectStore.prototype, 'get').mockImplementation(() => {
			throw new DOMException('The disk could not be read.', 'UnknownError');
		});
		const onChange = vi.fn();
		const onError = vi.fn();

		storage.watchSettings(onChange, onError);

		await expect.poll(() => onError).toHaveBeenCalledOnce();
		expect(onChange).not.toHaveBeenCalled();
	});

	it('keeps one row of only the changed settings under the key current', async () => {
		const name = newDatabaseName();
		const storage = new DexieStorage(name);
		await storage.saveSettings({ theme: 'light' });
		await storage.saveSettings({ volume: 10 });

		const saved = await openAsSaved(name);

		expect(await saved.table('settings').toArray()).toEqual([{ theme: 'light', volume: 10 }]);
		expect(await saved.table('settings').toCollection().primaryKeys()).toEqual(['current']);
	});

	it('keeps only the settings that differ from the defaults when an import replaces everything', async () => {
		const name = newDatabaseName();
		const storage = new DexieStorage(name);
		const settings: Settings = { ...DEFAULT_SETTINGS, theme: 'light', volume: 12 };

		await storage.replaceAllData(
			{ routines: [], runs: [], workPeriods: [], settings },
			{
				formatVersion: 1,
				exportedAt: '2026-11-17T08:00:00.000Z',
				routineCount: 0,
				runCount: 0,
				workPeriodCount: 0,
				firstRunAt: null,
				lastRunAt: null
			}
		);

		const saved = await openAsSaved(name);
		expect(await saved.table('settings').toArray()).toEqual([{ theme: 'light', volume: 12 }]);
		expect(await storage.readBackupData().then((data) => data.settings)).toEqual(settings);
	});

	it('fills in a setting a saved row lacks, as a row saved before the setting existed does', async () => {
		const name = newDatabaseName();
		const storage = new DexieStorage(name);
		await storage.getSettings();
		const saved = await openAsSaved(name);
		await saved.table('settings').put({ theme: 'system' }, 'current');
		saved.close();

		expect(await new DexieStorage(name).getSettings()).toEqual({
			...DEFAULT_SETTINGS,
			theme: 'system'
		});
	});

	describe('the theme mirror in localStorage', () => {
		// Leaves no mirror for the next test.
		afterEach(() => {
			localStorage.removeItem(THEME_MIRROR_KEY);
		});

		it('is written when the theme is saved', async () => {
			await new DexieStorage(newDatabaseName()).saveSettings({ theme: 'light' });

			expect(localStorage.getItem(THEME_MIRROR_KEY)).toBe('light');
		});

		it('is left alone when another setting is saved', async () => {
			const storage = new DexieStorage(newDatabaseName());
			await storage.saveSettings({ theme: 'light' });

			await storage.saveSettings({ volume: 10 });

			expect(localStorage.getItem(THEME_MIRROR_KEY)).toBe('light');
		});

		it('is written when the settings are read, so a user saved before the mirror existed gets one', async () => {
			const name = newDatabaseName();
			const storage = new DexieStorage(name);
			await storage.getSettings();
			const saved = await openAsSaved(name);
			await saved.table('settings').put({ theme: 'system' }, 'current');
			saved.close();
			localStorage.removeItem(THEME_MIRROR_KEY);

			await new DexieStorage(name).getSettings();

			expect(localStorage.getItem(THEME_MIRROR_KEY)).toBe('system');
		});

		it('is the default theme when nothing is saved', async () => {
			await new DexieStorage(newDatabaseName()).getSettings();

			expect(localStorage.getItem(THEME_MIRROR_KEY)).toBe('dark');
		});

		it('is written when another tab changes the theme', async () => {
			const name = newDatabaseName();
			const firstTab = new DexieStorage(name);
			const reports: Settings[] = [];
			firstTab.watchSettings(
				(settings) => reports.push(settings),
				() => {}
			);
			await expect.poll(() => reports).toHaveLength(1);
			localStorage.removeItem(THEME_MIRROR_KEY);

			await new DexieStorage(name).saveSettings({ theme: 'light' });

			await expect.poll(() => reports.at(-1)?.theme).toBe('light');
			expect(localStorage.getItem(THEME_MIRROR_KEY)).toBe('light');
		});

		it('is not written when the save fails', async () => {
			const storage = new DexieStorage(newDatabaseName());
			await storage.saveSettings({ theme: 'light' });
			vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
				throw new DOMException('The disk is full.', 'QuotaExceededError');
			});

			await expect(storage.saveSettings({ theme: 'system' })).rejects.toThrow();

			expect(localStorage.getItem(THEME_MIRROR_KEY)).toBe('light');
		});
	});

	it('reports a routine change made through another connection, as another tab’s', async () => {
		const name = newDatabaseName();
		const firstTab = new DexieStorage(name);
		const secondTab = new DexieStorage(name);
		await firstTab.addRoutinesIfNone([
			routineWith({ id: 'a', customPosition: 0 }),
			routineWith({ id: 'b', customPosition: 1 })
		]);
		const reports: string[][] = [];
		firstTab.watchRoutines(
			(routines) => reports.push(routines.map((routine) => routine.id)),
			() => {}
		);
		await expect.poll(() => reports).toEqual([['a', 'b']]);

		await secondTab.deleteRoutine('a');

		await expect.poll(() => reports.at(-1)).toEqual(['b']);
	});

	it('reports an error, and no routines, when the routines can’t be read', async () => {
		const storage = new DexieStorage(newDatabaseName());
		await storage.getRoutines();
		vi.spyOn(IDBObjectStore.prototype, 'getAll').mockImplementation(() => {
			throw new DOMException('The disk could not be read.', 'UnknownError');
		});
		vi.spyOn(IDBObjectStore.prototype, 'openCursor').mockImplementation(() => {
			throw new DOMException('The disk could not be read.', 'UnknownError');
		});
		const onChange = vi.fn();
		const onError = vi.fn();

		storage.watchRoutines(onChange, onError);

		await expect.poll(() => onError).toHaveBeenCalledOnce();
		expect(onChange).not.toHaveBeenCalled();
	});

	it('keeps the log after the database is opened again, with ids that carry on counting', async () => {
		const name = newDatabaseName();
		const first = new DexieStorage(name);
		await first.addRoutinesIfNone([routineWith({ id: 'a' }), routineWith({ id: 'b' })]);
		await first.deleteRoutine('a');

		const reopened = new DexieStorage(name);
		await reopened.saveRoutine(routineWith({ id: 'b', title: 'Edited' }));

		const entries = await reopened.getLogEntries();
		expect(entries.map((entry) => entry.id)).toEqual([2, 1]);
	});

	it('refuses one of two deletes of the last two routines from two connections at once, so one routine is left', async () => {
		const name = newDatabaseName();
		const firstTab = new DexieStorage(name);
		const secondTab = new DexieStorage(name);
		await firstTab.addRoutinesIfNone([
			routineWith({ id: 'a', customPosition: 0 }),
			routineWith({ id: 'b', customPosition: 1 })
		]);

		const results = await Promise.all([firstTab.deleteRoutine('a'), secondTab.deleteRoutine('b')]);

		expect(results.toSorted()).toEqual([false, true]);
		expect(await firstTab.getRoutines()).toHaveLength(1);
		const logged = (await firstTab.getLogEntries()).filter((entry) =>
			entry.message.startsWith('Deleted routine')
		);
		expect(logged).toHaveLength(1);
	});

	it('applies two changes from two connections one after the other, as two tabs at once', async () => {
		const name = newDatabaseName();
		const firstTab = new DexieStorage(name);
		const secondTab = new DexieStorage(name);
		await firstTab.addRoutinesIfNone([routineWith({ id: 'a', customPosition: 0 })]);

		await Promise.all([
			firstTab.createRoutine(routineWith({ id: 'first-tab', customPosition: 0 })),
			secondTab.createRoutine(routineWith({ id: 'second-tab', customPosition: 0 }))
		]);

		const routines = await firstTab.getRoutines();
		expect(routines.map((routine) => routine.customPosition)).toEqual([0, 1, 2]);
		expect(routines.map((routine) => routine.id).toSorted()).toEqual([
			'a',
			'first-tab',
			'second-tab'
		]);
		expect(await firstTab.getLogEntries()).toHaveLength(2);
	});

	it('keeps the newest 5,000 log entries by default', async () => {
		const name = newDatabaseName();
		const storage = new DexieStorage(name);
		await storage.addRoutinesIfNone([routineWith({ id: 'a' }), routineWith({ id: 'b' })]);
		const saved = await openAsSaved(name);
		const filler = Array.from({ length: 5000 }, (_, index) => ({
			timestamp: '2026-11-01T00:00:00.000Z',
			type: 'change',
			message: `Filler ${index}`
		}));
		await saved.table('log').bulkAdd(filler);
		saved.close();

		await storage.deleteRoutine('a');

		const entries = await storage.getLogEntries();
		expect(entries).toHaveLength(5000);
		expect(entries[0]?.message).toBe('Deleted routine "One round"');
		expect(entries.at(-1)?.message).toBe('Filler 1');
	});

	describe('when the log can’t be written', () => {
		/**
		 * Makes IndexedDB refuse every write to the log's object store, and no other, as a full disk
		 * might refuse one, so the routines still save.
		 *
		 * @param method - Which write to refuse: `add` or `put`.
		 * @throws {@link Error} When the browser has no such method on object stores.
		 */
		function failLogWrites(method: 'add' | 'put'): void {
			// Read off the prototype's descriptor, since naming the method itself would be an
			// unbound method to the linter.
			const original: unknown = Object.getOwnPropertyDescriptor(
				IDBObjectStore.prototype,
				method
			)?.value;
			if (typeof original !== 'function') {
				throw new Error(`Expected IDBObjectStore.prototype.${method} to be a function.`);
			}
			vi.spyOn(IDBObjectStore.prototype, method).mockImplementation(function (
				this: IDBObjectStore,
				...args: Parameters<IDBObjectStore['add']>
			): IDBRequest<IDBValidKey> {
				if (this.name === 'log') {
					throw new DOMException('The disk is full.', 'QuotaExceededError');
				}
				return Reflect.apply(original, this, args) as IDBRequest<IDBValidKey>;
			});
		}

		it('still saves the change, and reports the failure', async () => {
			const storage = new DexieStorage(newDatabaseName());
			await storage.addRoutinesIfNone([routineWith({ id: 'a' }), routineWith({ id: 'b' })]);
			const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
			failLogWrites('add');
			failLogWrites('put');

			const deleted = await storage.deleteRoutine('a');

			expect(deleted).toBe(true);
			expect((await storage.getRoutines()).map((routine) => routine.id)).toEqual(['b']);
			expect(await storage.getLogEntries()).toEqual([]);
			expect(logged).toHaveBeenCalledWith('Writing to the activity log failed.', expect.anything());
		});

		it('leaves every kind of change saved', async () => {
			const storage = new DexieStorage(newDatabaseName());
			await storage.addRoutinesIfNone([routineWith({ id: 'a' }), routineWith({ id: 'b' })]);
			vi.spyOn(console, 'error').mockImplementation(() => {});
			failLogWrites('add');
			failLogWrites('put');

			await storage.createRoutine(routineWith({ id: 'new', customPosition: 0 }));
			await storage.duplicateRoutine(routineWith({ id: 'copy' }), 'a');
			await storage.saveRoutine(routineWith({ id: 'b', title: 'Edited' }));
			await storage.reorderRoutines(['b', 'new', 'a', 'copy']);

			const routines = await storage.getRoutines();
			expect(routines.map((routine) => routine.id)).toEqual(['b', 'new', 'a', 'copy']);
			expect(routines[0]?.title).toBe('Edited');
		});

		it('still imports the backup, and reports the failure', async () => {
			const storage = new DexieStorage(newDatabaseName());
			await storage.addRoutinesIfNone([routineWith({ id: 'a' })]);
			const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
			failLogWrites('add');
			failLogWrites('put');
			const imported = routineWith({ id: 'imported' });

			await storage.replaceAllData(
				{ routines: [imported], runs: [], workPeriods: [], settings: DEFAULT_SETTINGS },
				{
					formatVersion: 1,
					exportedAt: '2026-11-17T08:00:00.000Z',
					routineCount: 1,
					runCount: 0,
					workPeriodCount: 0,
					firstRunAt: null,
					lastRunAt: null
				}
			);

			expect((await storage.readBackupData()).routines).toEqual([imported]);
			expect(await storage.getLogEntries()).toEqual([]);
			expect(logged).toHaveBeenCalledWith('Writing to the activity log failed.', expect.anything());
		});
	});

	it('aborts an import that fails midway, keeping every old table as it was', async () => {
		const storage = new DexieStorage(newDatabaseName());
		await storage.addRoutinesIfNone([routineWith({ id: 'a' })]);
		await storage.saveSettings({ volume: 5 });
		await storage.saveRunInProgress(savedRunInProgress, null, {
			run: runInProgress,
			workPeriods: [firstWorkPeriod]
		});
		const before = await storage.readBackupData();

		// The routines and runs go in before the work periods, whose repeated id fails the import.
		await expect(
			storage.replaceAllData(
				{
					routines: [routineWith({ id: 'new' })],
					runs: [runWith({ id: 'new-run', routineId: 'new' })],
					workPeriods: [workPeriodWith({ id: 'same' }), workPeriodWith({ id: 'same' })],
					settings: { ...DEFAULT_SETTINGS, volume: 77 }
				},
				{
					formatVersion: 1,
					exportedAt: '2026-11-17T08:00:00.000Z',
					routineCount: 1,
					runCount: 1,
					workPeriodCount: 2,
					firstRunAt: null,
					lastRunAt: null
				}
			)
		).rejects.toThrow();

		expect(await storage.readBackupData()).toEqual(before);
		expect(await storage.getRunInProgress()).toEqual(savedRunInProgress);
		expect(await storage.getLogEntries()).toEqual([]);
	});

	it('logs nothing when the routine can’t be saved', async () => {
		const name = newDatabaseName();
		const storage = new DexieStorage(name);
		await storage.addRoutinesIfNone([routineWith({ id: 'a' }), routineWith({ id: 'b' })]);
		vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
			throw new DOMException('The disk is full.', 'QuotaExceededError');
		});

		await expect(storage.deleteRoutine('a')).rejects.toThrow();
		vi.restoreAllMocks();

		expect((await storage.getRoutines()).map((routine) => routine.id)).toEqual(['a', 'b']);
		expect(await storage.getLogEntries()).toEqual([]);
	});

	it('keeps the app’s data in the database named cadoro', async () => {
		await new DexieStorage().addRoutinesIfNone([routineWith({ id: 'in-cadoro' })]);

		const saved = await openAsSaved('cadoro');

		expect(await saved.table('routines').toArray()).toEqual([routineWith({ id: 'in-cadoro' })]);
	});
});
