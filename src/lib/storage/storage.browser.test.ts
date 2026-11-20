import { describe, expect, it } from 'vitest';
import { createBackup, serializeBackup, type BackupData } from '../backup-format';
import { parseBackup } from '../backup-parsing';
import { summarizeBackup, type BackupSummary } from '../backup-summary';
import { requireDefined } from '../defined';
import { createRun, next, pause, play, type RunState } from '../run';
import { toStoredRunInProgress, type StoredRunInProgress } from '../run-in-progress';
import { recordPress, type Run } from '../run-records';
import { numberedIds } from '../testing/ids';
import { DEFAULT_SETTINGS, type Settings } from '../settings';
import { minutes } from '../testing/durations';
import { oneRoundRoutine, routineWith } from '../testing/routines';
import { runInProgressWith, savedRunInProgress } from '../testing/run-in-progress';
import { firstWorkPeriod, runInProgress, runWith, workPeriodWith } from '../testing/run-records';
import { DexieStorage } from './dexie-storage';
import { InMemoryStorage } from './in-memory-storage';
import type { CadoroStorage, StorageOptions } from './storage';

/** A backend the shared suite checks. */
type Backend = {
	/** The backend's class name, which names its group of tests. */
	name: string;
	/** Makes a new, empty storage, so no test sees another's data. */
	create: (options?: StorageOptions) => CadoroStorage;
};

/** Every backend, each checked against the same tests, so they all keep the same contract. */
const backends: Backend[] = [
	{ name: 'InMemoryStorage', create: (options) => new InMemoryStorage(options) },
	// A new database for each test. The test browser starts with no data on every run.
	{
		name: 'DexieStorage',
		create: (options) => new DexieStorage(`test-${crypto.randomUUID()}`, options)
	}
];

/** The moment every storage in these tests believes it is, so log timestamps can be checked. */
const NOW = '2026-11-19T10:00:00.000Z';

/** Options that give a storage the fixed moment {@link NOW}. */
const atNow: StorageOptions = { now: () => new Date(NOW) };

/**
 * Makes storage that holds three routines, a, b and c, in that order.
 *
 * @param create - Makes the backend's storage.
 * @param options - What to give the storage, such as the fixed moment.
 * @returns The storage, with an empty log, since adding the first routines isn't a change.
 */
async function storageWithAbc(
	create: (options?: StorageOptions) => CadoroStorage,
	options: StorageOptions = atNow
): Promise<CadoroStorage> {
	const storage = create(options);
	await storage.addRoutinesIfNone([
		routineWith({ id: 'a', title: 'A', customPosition: 0 }),
		routineWith({ id: 'b', title: 'B', customPosition: 1 }),
		routineWith({ id: 'c', title: 'C', customPosition: 2 })
	]);
	return storage;
}

/**
 * Reads each routine's id and position, for the routines not deleted.
 *
 * @param storage - The storage to read.
 * @returns `id:position` for each, in custom order.
 */
async function placed(storage: CadoroStorage): Promise<string[]> {
	const routines = await storage.getRoutines();
	return routines.map((routine) => `${routine.id}:${routine.customPosition}`);
}

/** A run being played through the engine in a test, with what saving it needs to remember. */
type PressState = {
	/** The run so far. */
	run: RunState;
	/** The run's record once Play has started it, or `null` before. */
	record: Run | null;
	/** The revision of the run in progress saved last, or `null` before the first save. */
	revision: string | null;
};

/** What a test following the run in progress has been told so far. */
type Reports = {
	/** Each run in progress reported, oldest first. */
	changes: (StoredRunInProgress | null)[];
	/** Stops following. */
	stop: () => void;
};

/**
 * Follows a storage's run in progress, keeping each report for the test to check.
 *
 * @remarks
 * No test here expects storage to report an error, so one is thrown from the report, which
 * Vitest fails the run for as an unhandled error.
 *
 * @param storage - The storage to follow.
 * @returns The reports so far, which grow as storage reports more, and the way to stop.
 */
function follow(storage: CadoroStorage): Reports {
	const changes: (StoredRunInProgress | null)[] = [];
	const stop = storage.watchRunInProgress(
		(runInProgress) => {
			changes.push(runInProgress);
		},
		(error: unknown) => {
			throw new Error('Following the run in progress failed.', { cause: error });
		}
	);
	return { changes, stop };
}

describe.each(backends)('$name', ({ create }) => {
	describe('getRoutines', () => {
		it('returns nothing from empty storage', async () => {
			const storage = create();

			expect(await storage.getRoutines()).toEqual([]);
		});

		it('returns the routines in custom order, whatever order they were added in', async () => {
			const storage = create();
			await storage.addRoutinesIfNone([
				routineWith({ id: 'third', customPosition: 2 }),
				routineWith({ id: 'first', customPosition: 0 }),
				routineWith({ id: 'second', customPosition: 1 })
			]);

			const routines = await storage.getRoutines();

			expect(routines.map((routine) => routine.id)).toEqual(['first', 'second', 'third']);
		});

		it('leaves out deleted routines', async () => {
			const storage = create();
			await storage.addRoutinesIfNone([
				routineWith({ id: 'kept', customPosition: 0 }),
				routineWith({ id: 'deleted', customPosition: 1, deletedAt: '2026-01-05T09:00:00.000Z' })
			]);

			const routines = await storage.getRoutines();

			expect(routines.map((routine) => routine.id)).toEqual(['kept']);
		});

		it('returns copies, so changing one leaves the saved routine unchanged', async () => {
			const storage = create();
			await storage.addRoutinesIfNone([routineWith({ title: 'Writing' })]);
			const [read] = await storage.getRoutines();
			const readRoutine = requireDefined(read, 'the saved routine');
			readRoutine.title = 'Changed';
			requireDefined(readRoutine.blocks[0], "the routine's block").targetMinutes = 50;

			const [readAgain] = await storage.getRoutines();

			expect(readAgain?.title).toBe('Writing');
			expect(readAgain?.blocks[0]?.targetMinutes).toBe(25);
		});
	});

	describe('addRoutinesIfNone', () => {
		it('saves every field of the routines into empty storage, and says it did', async () => {
			const storage = create();
			const routine = routineWith({
				id: 'writing',
				title: 'Writing',
				rounds: 'infinite',
				blocks: [
					{ id: 'draft', title: 'Draft', targetMinutes: 50, breakPercent: 20, cycles: 2 },
					{ id: 'edit', title: 'Edit', targetMinutes: 30, breakPercent: 10, cycles: 1 }
				],
				customPosition: 0,
				createdAt: '2026-01-05T09:00:00.000Z'
			});

			const added = await storage.addRoutinesIfNone([routine]);

			expect(added).toBe(true);
			expect(await storage.getRoutines()).toEqual([routine]);
		});

		it('refuses when storage holds routines, and keeps the ones it has', async () => {
			const storage = create();
			await storage.addRoutinesIfNone([routineWith({ id: 'existing' })]);

			const added = await storage.addRoutinesIfNone([routineWith({ id: 'new' })]);

			expect(added).toBe(false);
			const routines = await storage.getRoutines();
			expect(routines.map((routine) => routine.id)).toEqual(['existing']);
		});

		it('refuses when the only routine is deleted, so deleted starters never come back', async () => {
			const storage = create();
			await storage.addRoutinesIfNone([
				routineWith({ id: 'deleted', deletedAt: '2026-01-05T09:00:00.000Z' })
			]);

			const added = await storage.addRoutinesIfNone([routineWith({ id: 'new' })]);

			expect(added).toBe(false);
			expect(await storage.getRoutines()).toEqual([]);
		});

		it('saves copies, so changing a routine after adding it leaves the saved one unchanged', async () => {
			const storage = create();
			const routine = routineWith({ title: 'Writing' });
			await storage.addRoutinesIfNone([routine]);
			routine.title = 'Changed';

			const [saved] = await storage.getRoutines();

			expect(saved?.title).toBe('Writing');
		});
	});

	describe('getAllRoutines', () => {
		it('returns nothing from empty storage', async () => {
			expect(await create().getAllRoutines()).toEqual([]);
		});

		it('returns deleted routines too, in custom order', async () => {
			const storage = create();
			await storage.addRoutinesIfNone([
				routineWith({ id: 'second', customPosition: 1 }),
				routineWith({ id: 'deleted', customPosition: 2, deletedAt: '2026-01-05T09:00:00.000Z' }),
				routineWith({ id: 'first', customPosition: 0 })
			]);

			const routines = await storage.getAllRoutines();

			expect(routines.map((routine) => routine.id)).toEqual(['first', 'second', 'deleted']);
		});

		it('returns copies, so changing one leaves the saved routine unchanged', async () => {
			const storage = create();
			await storage.addRoutinesIfNone([routineWith({ title: 'Writing' })]);
			requireDefined((await storage.getAllRoutines())[0], 'the saved routine').title = 'Changed';

			expect((await storage.getAllRoutines())[0]?.title).toBe('Writing');
		});
	});

	describe('createRoutine', () => {
		it('puts the routine at its position and moves down those from there on', async () => {
			const storage = await storageWithAbc(create);

			await storage.createRoutine(routineWith({ id: 'new', customPosition: 0 }));

			expect(await placed(storage)).toEqual(['new:0', 'a:1', 'b:2', 'c:3']);
		});

		it('saves every field of the routine', async () => {
			const storage = await storageWithAbc(create);
			const routine = routineWith({
				id: 'new',
				title: 'New',
				rounds: 'infinite',
				customPosition: 3,
				createdAt: NOW
			});

			await storage.createRoutine(routine);

			expect((await storage.getRoutines()).at(-1)).toEqual(routine);
		});

		it('saves a copy, so changing the routine afterwards leaves the saved one unchanged', async () => {
			const storage = await storageWithAbc(create);
			const routine = routineWith({ id: 'new', title: 'New', customPosition: 3 });
			await storage.createRoutine(routine);
			routine.title = 'Changed';

			expect((await storage.getRoutines()).at(-1)?.title).toBe('New');
		});

		it('refuses an id that is saved already, even a deleted routine’s, and changes nothing', async () => {
			const storage = await storageWithAbc(create);
			await storage.deleteRoutine('c');

			await expect(
				storage.createRoutine(routineWith({ id: 'c', customPosition: 0 }))
			).rejects.toThrow('already saved');
			await expect(
				storage.createRoutine(routineWith({ id: 'a', customPosition: 0 }))
			).rejects.toThrow('already saved');

			expect(await placed(storage)).toEqual(['a:0', 'b:1']);
			expect(await storage.getLogEntries()).toHaveLength(1);
		});
	});

	describe('duplicateRoutine', () => {
		it('puts the copy just below the original, whatever position the copy has', async () => {
			const storage = await storageWithAbc(create);

			await storage.duplicateRoutine(routineWith({ id: 'copy', customPosition: 0 }), 'a');

			expect(await placed(storage)).toEqual(['a:0', 'copy:1', 'b:2', 'c:3']);
		});

		it('refuses an original that is missing or deleted, and changes nothing', async () => {
			const storage = await storageWithAbc(create);
			await storage.deleteRoutine('c');

			await expect(storage.duplicateRoutine(routineWith({ id: 'copy' }), 'c')).rejects.toThrow(
				'none is saved'
			);
			await expect(storage.duplicateRoutine(routineWith({ id: 'copy' }), 'x')).rejects.toThrow(
				'none is saved'
			);

			expect(await placed(storage)).toEqual(['a:0', 'b:1']);
		});
	});

	describe('saveRoutine', () => {
		it('saves the new title, rounds and blocks', async () => {
			const storage = await storageWithAbc(create);
			const blocks = [
				{ id: 'only', title: 'Deep work', targetMinutes: 50, breakPercent: 10, cycles: 1 }
			];

			await storage.saveRoutine(routineWith({ id: 'b', title: 'Renamed', rounds: 4, blocks }));

			const saved = requireDefined(
				(await storage.getRoutines()).find((routine) => routine.id === 'b'),
				'routine b'
			);
			expect(saved.title).toBe('Renamed');
			expect(saved.rounds).toBe(4);
			expect(saved.blocks).toEqual(blocks);
		});

		it('keeps the saved position, creation date and deletion, so an old edit can’t undo a reorder', async () => {
			const storage = await storageWithAbc(create);
			await storage.reorderRoutines(['c', 'b', 'a']);

			await storage.saveRoutine(
				routineWith({
					id: 'a',
					title: 'Edited',
					customPosition: 0,
					createdAt: '2000-01-01T00:00:00.000Z',
					deletedAt: NOW
				})
			);

			const saved = requireDefined(
				(await storage.getRoutines()).find((routine) => routine.id === 'a'),
				'routine a'
			);
			expect(saved).toEqual(routineWith({ id: 'a', title: 'Edited', customPosition: 2 }));
		});

		it('refuses a routine that is missing or deleted, and changes nothing', async () => {
			const storage = await storageWithAbc(create);
			await storage.deleteRoutine('c');

			await expect(storage.saveRoutine(routineWith({ id: 'c', title: 'X' }))).rejects.toThrow(
				'none is saved'
			);
			await expect(storage.saveRoutine(routineWith({ id: 'x', title: 'X' }))).rejects.toThrow(
				'none is saved'
			);

			expect((await storage.getAllRoutines()).map((routine) => routine.title)).toEqual([
				'A',
				'B',
				'C'
			]);
		});
	});

	describe('the routine of the run in progress', () => {
		/**
		 * Makes storage holding routines a, b and c, with a run of routine `a` in progress.
		 *
		 * @returns The storage.
		 */
		async function storageRunning(): Promise<CadoroStorage> {
			const storage = await storageWithAbc(create);
			await storage.saveRunInProgress(
				runInProgressWith({ record: runWith({ routineId: 'a' }) }),
				null
			);
			return storage;
		}

		it('can’t be edited, so the run keeps the routine it started with', async () => {
			const storage = await storageRunning();

			await expect(storage.saveRoutine(routineWith({ id: 'a', title: 'Edited' }))).rejects.toThrow(
				'is running'
			);

			const saved = (await storage.getRoutines()).find((routine) => routine.id === 'a');
			expect(saved?.title).toBe('A');
			expect(await storage.getLogEntries()).toEqual([]);
		});

		it('can’t be deleted, and nothing changes', async () => {
			const storage = await storageRunning();

			await expect(storage.deleteRoutine('a')).rejects.toThrow('is running');

			expect(await placed(storage)).toEqual(['a:0', 'b:1', 'c:2']);
			expect(await storage.getLogEntries()).toEqual([]);
		});

		it('leaves the other routines free to edit and delete', async () => {
			const storage = await storageRunning();

			await storage.saveRoutine(routineWith({ id: 'b', title: 'Edited' }));
			const deleted = await storage.deleteRoutine('c');

			expect(deleted).toBe(true);
			expect((await storage.getRoutines()).map((routine) => routine.title)).toEqual([
				'A',
				'Edited'
			]);
		});

		it('is free again once the run is forgotten', async () => {
			const storage = await storageRunning();
			await storage.clearRunInProgress('revision-1');

			await storage.saveRoutine(routineWith({ id: 'a', title: 'Edited' }));

			const saved = (await storage.getRoutines()).find((routine) => routine.id === 'a');
			expect(saved?.title).toBe('Edited');
		});
	});

	describe('deleteRoutine', () => {
		it('sets deletedAt to the moment of the deletion and hides the routine from getRoutines', async () => {
			const storage = await storageWithAbc(create);

			const deleted = await storage.deleteRoutine('b');

			expect(deleted).toBe(true);
			expect(await placed(storage)).toEqual(['a:0', 'c:2']);
			const all = await storage.getAllRoutines();
			expect(all.find((routine) => routine.id === 'b')?.deletedAt).toBe(NOW);
		});

		it('refuses to delete the only routine not deleted, saying so, and changes nothing', async () => {
			const storage = await storageWithAbc(create);
			await storage.deleteRoutine('a');
			await storage.deleteRoutine('b');

			const deleted = await storage.deleteRoutine('c');

			expect(deleted).toBe(false);
			expect(await placed(storage)).toEqual(['c:2']);
			expect(await storage.getLogEntries()).toHaveLength(2);
		});

		it('allows deleting down to the last routine, whatever the number of deleted ones', async () => {
			const storage = create();
			await storage.addRoutinesIfNone([
				routineWith({ id: 'gone', deletedAt: '2026-01-05T09:00:00.000Z' }),
				routineWith({ id: 'one', customPosition: 1 }),
				routineWith({ id: 'two', customPosition: 2 })
			]);

			expect(await storage.deleteRoutine('one')).toBe(true);
			expect(await storage.deleteRoutine('two')).toBe(false);
		});

		it('refuses a routine that is missing or already deleted', async () => {
			const storage = await storageWithAbc(create);
			await storage.deleteRoutine('c');

			await expect(storage.deleteRoutine('c')).rejects.toThrow('none is saved');
			await expect(storage.deleteRoutine('x')).rejects.toThrow('none is saved');
		});
	});

	describe('reorderRoutines', () => {
		it('saves the new order', async () => {
			const storage = await storageWithAbc(create);

			const changed = await storage.reorderRoutines(['c', 'a', 'b']);

			expect(changed).toBe(true);
			expect(await placed(storage)).toEqual(['c:0', 'a:1', 'b:2']);
		});

		it('leaves deleted routines where they were', async () => {
			const storage = await storageWithAbc(create);
			await storage.deleteRoutine('b');

			await storage.reorderRoutines(['c', 'a']);

			const all = await storage.getAllRoutines();
			expect(all.map((routine) => `${routine.id}:${routine.customPosition}`)).toEqual([
				'c:0',
				'a:1',
				'b:1'
			]);
		});

		it('says no, and saves and logs nothing, when the order is the saved one', async () => {
			const storage = await storageWithAbc(create);

			const changed = await storage.reorderRoutines(['a', 'b', 'c']);

			expect(changed).toBe(false);
			expect(await storage.getLogEntries()).toEqual([]);
		});

		it('refuses ids that are not exactly the routines not deleted, each once, and changes nothing', async () => {
			const storage = await storageWithAbc(create);
			await storage.deleteRoutine('c');

			await expect(storage.reorderRoutines(['b', 'a', 'c'])).rejects.toThrow('each once');
			await expect(storage.reorderRoutines(['b'])).rejects.toThrow('each once');
			await expect(storage.reorderRoutines(['b', 'b'])).rejects.toThrow('each once');

			expect(await placed(storage)).toEqual(['a:0', 'b:1']);
		});
	});

	describe('watchRoutines', () => {
		/**
		 * Follows a storage's routines, keeping each report.
		 *
		 * @param storage - The storage to follow.
		 * @returns The routines' ids reported so far, which grow, and the way to stop.
		 */
		function followRoutines(storage: CadoroStorage): { changes: string[][]; stop: () => void } {
			const changes: string[][] = [];
			const stop = storage.watchRoutines(
				(routines) => {
					changes.push(routines.map((routine) => routine.id));
				},
				(error: unknown) => {
					throw new Error('Following the routines failed.', { cause: error });
				}
			);
			return { changes, stop };
		}

		it('reports the routines soon after following starts, and not during the call', async () => {
			const storage = await storageWithAbc(create);

			const reports = followRoutines(storage);

			expect(reports.changes).toEqual([]);
			await expect.poll(() => reports.changes).toEqual([['a', 'b', 'c']]);
		});

		it('reports each kind of change, leaving out deleted routines', async () => {
			const storage = await storageWithAbc(create);
			const reports = followRoutines(storage);
			await expect.poll(() => reports.changes).toHaveLength(1);

			await storage.createRoutine(routineWith({ id: 'new', customPosition: 0 }));
			await expect.poll(() => reports.changes.at(-1)).toEqual(['new', 'a', 'b', 'c']);

			await storage.reorderRoutines(['a', 'new', 'b', 'c']);
			await expect.poll(() => reports.changes.at(-1)).toEqual(['a', 'new', 'b', 'c']);

			await storage.deleteRoutine('new');
			await expect.poll(() => reports.changes.at(-1)).toEqual(['a', 'b', 'c']);

			await storage.saveRoutine(routineWith({ id: 'a', title: 'Renamed' }));
			await expect.poll(() => reports.changes.length).toBeGreaterThan(3);
			await storage.duplicateRoutine(routineWith({ id: 'copy' }), 'a');
			await expect.poll(() => reports.changes.at(-1)).toEqual(['a', 'copy', 'b', 'c']);
		});

		it('reports the starter routines when they are added', async () => {
			const storage = create();
			const reports = followRoutines(storage);
			await expect.poll(() => reports.changes).toEqual([[]]);

			await storage.addRoutinesIfNone([routineWith({ id: 'starter' })]);

			await expect.poll(() => reports.changes.at(-1)).toEqual(['starter']);
		});

		it('reports to everything following, as each open tab follows', async () => {
			const storage = await storageWithAbc(create);
			const first = followRoutines(storage);
			const second = followRoutines(storage);

			await storage.deleteRoutine('c');

			await expect.poll(() => first.changes.at(-1)).toEqual(['a', 'b']);
			await expect.poll(() => second.changes.at(-1)).toEqual(['a', 'b']);
		});

		it('reports nothing more once stopped', async () => {
			const storage = await storageWithAbc(create);
			const stopped = followRoutines(storage);
			const still = followRoutines(storage);
			await expect.poll(() => stopped.changes).toHaveLength(1);

			stopped.stop();
			await storage.deleteRoutine('c');

			await expect.poll(() => still.changes.at(-1)).toEqual(['a', 'b']);
			expect(stopped.changes).toHaveLength(1);
		});
	});

	describe('getLogEntries', () => {
		it('returns nothing from empty storage, and nothing for adding the first routines', async () => {
			const storage = await storageWithAbc(create);

			expect(await storage.getLogEntries()).toEqual([]);
		});

		it('logs each change as a change entry stamped with the moment of the change, newest first', async () => {
			const storage = await storageWithAbc(create);

			await storage.createRoutine(routineWith({ id: 'new', title: 'New', customPosition: 0 }));
			await storage.deleteRoutine('new');

			const entries = await storage.getLogEntries();
			expect(entries.map((entry) => entry.message)).toEqual([
				'Deleted routine "New"',
				'Created routine "New"'
			]);
			expect(entries.map((entry) => entry.type)).toEqual(['change', 'change']);
			expect(entries.map((entry) => entry.timestamp)).toEqual([NOW, NOW]);
			const [newer, older] = entries;
			expect(requireDefined(newer, 'the newer entry').id).toBeGreaterThan(
				requireDefined(older, 'the older entry').id
			);
		});

		it('logs an edit with the old and new title, rounds and blocks', async () => {
			const storage = await storageWithAbc(create);
			const blocks = routineWith({}).blocks;

			await storage.saveRoutine(routineWith({ id: 'b', title: 'Renamed', rounds: 'infinite' }));

			const [entry] = await storage.getLogEntries();
			expect(entry?.message).toBe('Edited routine "Renamed"');
			expect(entry?.details).toEqual({
				action: 'edit',
				routineId: 'b',
				old: { title: 'B', rounds: 1, blocks },
				new: { title: 'Renamed', rounds: 'infinite', blocks }
			});
		});

		it('logs a creation, a duplicate, a deletion and a reorder, each with its details', async () => {
			const storage = await storageWithAbc(create);

			await storage.createRoutine(routineWith({ id: 'new', title: 'New', customPosition: 3 }));
			await storage.duplicateRoutine(routineWith({ id: 'copy', title: 'A (copy)' }), 'a');
			await storage.reorderRoutines(['copy', 'a', 'b', 'c', 'new']);
			await storage.deleteRoutine('new');

			const entries = await storage.getLogEntries();
			expect(entries.map((entry) => entry.details?.['action'])).toEqual([
				'delete',
				'reorder',
				'duplicate',
				'create'
			]);
			expect(entries[0]?.details).toMatchObject({ routineId: 'new' });
			expect(entries[1]?.details).toEqual({
				action: 'reorder',
				old: ['a', 'copy', 'b', 'c', 'new'],
				new: ['copy', 'a', 'b', 'c', 'new']
			});
			expect(entries[2]?.details).toMatchObject({ routineId: 'copy', originalId: 'a' });
			expect(entries[3]?.details).toMatchObject({ routineId: 'new' });
		});

		it('returns copies, so changing one leaves the saved entry unchanged', async () => {
			const storage = await storageWithAbc(create);
			await storage.deleteRoutine('c');
			requireDefined((await storage.getLogEntries())[0], 'the entry').message = 'Changed';

			expect((await storage.getLogEntries())[0]?.message).toBe('Deleted routine "C"');
		});

		it('adds an entry given to addLogEntry, newest first, with its details', async () => {
			const storage = await storageWithAbc(create);
			await storage.deleteRoutine('c');

			await storage.addLogEntry({
				timestamp: NOW,
				type: 'error',
				message: 'Something failed.',
				details: { name: 'Error', message: 'x' }
			});

			const entries = await storage.getLogEntries();
			expect(entries.map((entry) => entry.message)).toEqual([
				'Something failed.',
				'Deleted routine "C"'
			]);
			expect(entries[0]).toMatchObject({
				type: 'error',
				timestamp: NOW,
				details: { name: 'Error', message: 'x' }
			});
			expect(requireDefined(entries[0], 'the error entry').id).toBeGreaterThan(
				requireDefined(entries[1], 'the earlier entry').id
			);
		});

		it('drops the oldest entries when addLogEntry takes the log over its limit', async () => {
			const storage = create({ ...atNow, logLimit: 2 });

			for (const message of ['one', 'two', 'three']) {
				await storage.addLogEntry({ timestamp: NOW, type: 'error', message });
			}

			expect((await storage.getLogEntries()).map((entry) => entry.message)).toEqual([
				'three',
				'two'
			]);
		});

		describe('a repeated error', () => {
			/**
			 * Makes an error entry.
			 *
			 * @param timestamp - When it happened.
			 * @param changes - What differs from the usual entry, such as its message.
			 * @returns The entry.
			 */
			function errorAt(
				timestamp: string,
				changes: { message?: string; name?: string; errorMessage?: string } = {}
			): Parameters<CadoroStorage['addLogEntry']>[0] {
				return {
					timestamp,
					type: 'error',
					message: changes.message ?? 'Something failed.',
					details: { name: changes.name ?? 'Error', message: changes.errorMessage ?? 'x' }
				};
			}

			it('is collapsed into the entry before it, with a count and the moment of the last one', async () => {
				const storage = create();

				await storage.addLogEntry(errorAt('2026-11-19T10:00:00.000Z'));
				await storage.addLogEntry(errorAt('2026-11-19T10:00:05.000Z'));
				await storage.addLogEntry(errorAt('2026-11-19T10:00:30.000Z'));

				const entries = await storage.getLogEntries();
				expect(entries).toHaveLength(1);
				expect(entries[0]).toMatchObject({
					timestamp: '2026-11-19T10:00:00.000Z',
					details: {
						name: 'Error',
						message: 'x',
						count: 3,
						lastTimestamp: '2026-11-19T10:00:30.000Z'
					}
				});
			});

			it('keeps collapsing while the errors keep coming, each within the window of the last', async () => {
				const storage = create();

				for (const second of [0, 50, 100, 150]) {
					const timestamp = new Date(Date.UTC(2026, 10, 19, 10, 0, second)).toISOString();
					await storage.addLogEntry(errorAt(timestamp));
				}

				const entries = await storage.getLogEntries();
				expect(entries).toHaveLength(1);
				expect(entries[0]?.details).toMatchObject({ count: 4 });
			});

			it('is a new entry once the window has passed since the last one', async () => {
				const storage = create();

				await storage.addLogEntry(errorAt('2026-11-19T10:00:00.000Z'));
				await storage.addLogEntry(errorAt('2026-11-19T10:05:00.000Z'));

				expect(await storage.getLogEntries()).toHaveLength(2);
			});

			it('is a new entry when its message, or its error’s name or message, differs', async () => {
				const storage = create();

				await storage.addLogEntry(errorAt('2026-11-19T10:00:00.000Z'));
				await storage.addLogEntry(errorAt('2026-11-19T10:00:01.000Z', { message: 'Other.' }));
				await storage.addLogEntry(errorAt('2026-11-19T10:00:02.000Z', { name: 'TypeError' }));
				await storage.addLogEntry(errorAt('2026-11-19T10:00:03.000Z', { errorMessage: 'y' }));

				expect(await storage.getLogEntries()).toHaveLength(4);
			});

			it('never collapses with a change entry, or two changes', async () => {
				const storage = await storageWithAbc(create);

				await storage.saveRoutine(routineWith({ id: 'a', title: 'One' }));
				await storage.saveRoutine(routineWith({ id: 'a', title: 'One', rounds: 2 }));
				await storage.addLogEntry(errorAt(NOW, { message: 'Edited routine "One"' }));

				expect(await storage.getLogEntries()).toHaveLength(3);
			});

			it('can’t push routine changes out of the log, however many times it repeats', async () => {
				const storage = await storageWithAbc(create, { ...atNow, logLimit: 3 });
				await storage.saveRoutine(routineWith({ id: 'a', title: 'One' }));

				for (let repeat = 0; repeat < 10; repeat++) {
					await storage.addLogEntry(errorAt(NOW));
				}

				expect((await storage.getLogEntries()).map((entry) => entry.message)).toEqual([
					'Something failed.',
					'Edited routine "One"'
				]);
			});
		});

		it('keeps only the newest entries once the log is over its limit', async () => {
			const storage = await storageWithAbc(create, { ...atNow, logLimit: 3 });

			for (const title of ['one', 'two', 'three', 'four', 'five']) {
				await storage.saveRoutine(routineWith({ id: 'a', title }));
			}

			const entries = await storage.getLogEntries();
			expect(entries.map((entry) => entry.message)).toEqual([
				'Edited routine "five"',
				'Edited routine "four"',
				'Edited routine "three"'
			]);
		});
	});

	describe('saveRunInProgress', () => {
		it('saves every field of a run and its work periods', async () => {
			const storage = create();
			const pausedPeriod = workPeriodWith({
				id: 'period-2',
				segments: [
					{ start: '2026-11-19T09:30:00.000Z', end: '2026-11-19T09:40:00.000Z' },
					{ start: '2026-11-19T09:45:00.000Z', end: '2026-11-19T10:00:00.250Z' }
				],
				workedMs: 1_500_250
			});

			await storage.saveRunInProgress(savedRunInProgress, null, {
				run: runInProgress,
				workPeriods: [firstWorkPeriod, pausedPeriod]
			});

			expect(await storage.getRuns()).toEqual([runInProgress]);
			expect(await storage.getWorkPeriods()).toEqual([firstWorkPeriod, pausedPeriod]);
		});

		it('replaces the run when it is saved again as it ends', async () => {
			const storage = create();
			await storage.saveRunInProgress(savedRunInProgress, null, {
				run: runInProgress,
				workPeriods: []
			});
			const endedRun = runWith({
				endedAt: '2026-11-19T09:25:00.000Z',
				outcome: 'completed',
				roundsReached: 1
			});

			await storage.saveRunInProgress(savedRunInProgress, 'revision-1', {
				run: endedRun,
				workPeriods: [firstWorkPeriod]
			});

			expect(await storage.getRuns()).toEqual([endedRun]);
		});

		it('refuses a new run whose routine isn’t saved, as after an import in another tab, and saves nothing', async () => {
			const storage = create();
			await storage.addRoutinesIfNone([routineWith({ id: 'imported' })]);

			await expect(
				storage.saveRunInProgress(savedRunInProgress, null, {
					run: runWith({ routineId: 'replaced' }),
					workPeriods: []
				})
			).rejects.toThrow('routine "replaced"');

			expect(await storage.getRuns()).toEqual([]);
			expect(await storage.getRunInProgress()).toBeNull();
		});

		it('accepts a new run of a routine that is deleted, since the backup still holds it', async () => {
			const storage = create();
			await storage.addRoutinesIfNone([
				routineWith({ id: 'one-round', deletedAt: '2026-11-18T09:00:00.000Z' })
			]);

			const isSaved = await storage.saveRunInProgress(savedRunInProgress, null, {
				run: runInProgress,
				workPeriods: []
			});

			expect(isSaved).toBe(true);
		});

		it('adds work periods and leaves the run as it was when the run is null', async () => {
			const storage = create();
			await storage.saveRunInProgress(savedRunInProgress, null, {
				run: runInProgress,
				workPeriods: []
			});

			await storage.saveRunInProgress(savedRunInProgress, 'revision-1', {
				run: null,
				workPeriods: [firstWorkPeriod]
			});

			expect(await storage.getRuns()).toEqual([runInProgress]);
			expect(await storage.getWorkPeriods()).toEqual([firstWorkPeriod]);
		});

		it('does not add runs or work periods to the activity log', async () => {
			const storage = create(atNow);

			await storage.saveRunInProgress(savedRunInProgress, null, {
				run: runInProgress,
				workPeriods: [firstWorkPeriod]
			});

			expect(await storage.getLogEntries()).toEqual([]);
		});

		it('rejects a work period whose id is already saved, and saves nothing from that call', async () => {
			const storage = create();
			await storage.saveRunInProgress(savedRunInProgress, null, {
				run: runInProgress,
				workPeriods: [firstWorkPeriod]
			});
			const newPeriod = workPeriodWith({ id: 'period-2' });
			const endedRun = runWith({ endedAt: '2026-11-19T09:50:00.000Z', outcome: 'finished' });
			const endedRunInProgress = runInProgressWith({
				run: { status: 'ended', endedPeriods: [], outcome: 'finished' },
				heartbeatAt: '2026-11-19T09:50:00.000Z',
				revision: 'revision-2'
			});

			await expect(
				storage.saveRunInProgress(endedRunInProgress, 'revision-1', {
					run: endedRun,
					workPeriods: [newPeriod, firstWorkPeriod]
				})
			).rejects.toThrow();

			expect(await storage.getRunInProgress()).toEqual(savedRunInProgress);
			expect(await storage.getRuns()).toEqual([runInProgress]);
			expect(await storage.getWorkPeriods()).toEqual([firstWorkPeriod]);
		});

		it('saves copies, so changing records after saving them leaves the saved ones unchanged', async () => {
			const storage = create();
			const run = runWith({});
			const period = workPeriodWith({});
			await storage.saveRunInProgress(savedRunInProgress, null, { run, workPeriods: [period] });
			run.roundsReached = 5;
			requireDefined(period.segments[0], "the period's segment").end = '2026-11-19T11:00:00.000Z';

			expect(await storage.getRuns()).toEqual([runInProgress]);
			expect(await storage.getWorkPeriods()).toEqual([firstWorkPeriod]);
		});

		it('saves every field of the run in progress', async () => {
			const storage = create();
			const onBreak = runInProgressWith({
				run: {
					status: 'break',
					endedPeriods: [
						{
							position: { round: 0, block: 0, cycle: 0 },
							targetMinutes: 25,
							segments: [{ start: '2026-11-19T09:00:00.000Z', end: '2026-11-19T09:25:00.250Z' }],
							workedMs: minutes(25) + 250
						}
					],
					position: { round: 0, block: 0, cycle: 0 },
					nextWorkPosition: { round: 1, block: 0, cycle: 0 },
					earnedMs: minutes(5),
					remainingMs: minutes(4),
					runningSince: null
				},
				heartbeatAt: '2026-11-19T09:26:00.000Z'
			});

			await storage.saveRunInProgress(onBreak, null);

			expect(await storage.getRunInProgress()).toEqual(onBreak);
		});

		it('replaces the run in progress with each save, leaving runs and work periods alone when it keeps nothing new', async () => {
			const storage = create();
			await storage.saveRunInProgress(savedRunInProgress, null, {
				run: runInProgress,
				workPeriods: [firstWorkPeriod]
			});
			const later = runInProgressWith({
				heartbeatAt: '2026-11-19T09:10:01.000Z',
				revision: 'revision-2'
			});

			await storage.saveRunInProgress(later, 'revision-1');

			expect(await storage.getRunInProgress()).toEqual(later);
			expect(await storage.getRuns()).toEqual([runInProgress]);
			expect(await storage.getWorkPeriods()).toEqual([firstWorkPeriod]);
		});

		it('saves a copy, so changing the run in progress after saving it leaves the saved one unchanged', async () => {
			const storage = create();
			const saved = runInProgressWith({});
			await storage.saveRunInProgress(saved, null);
			saved.heartbeatAt = '2026-11-19T11:00:00.000Z';
			saved.record.roundsReached = 5;

			expect(await storage.getRunInProgress()).toEqual(savedRunInProgress);
		});

		it('says it saved a change worked out from the revision saved', async () => {
			const storage = create();
			const firstSaved = await storage.saveRunInProgress(savedRunInProgress, null);
			const paused = runInProgressWith({ revision: 'revision-2' });

			const secondSaved = await storage.saveRunInProgress(paused, 'revision-1');

			expect([firstSaved, secondSaved]).toEqual([true, true]);
			expect(await storage.getRunInProgress()).toEqual(paused);
		});

		it('refuses a change worked out from another revision, as from a tab that missed a press, and saves nothing from it', async () => {
			const storage = create();
			await storage.saveRunInProgress(savedRunInProgress, null, {
				run: runInProgress,
				workPeriods: []
			});
			const stale = runInProgressWith({
				run: { status: 'ended', endedPeriods: [], outcome: 'finished' },
				revision: 'revision-3'
			});

			const saved = await storage.saveRunInProgress(stale, 'revision-2', {
				run: runWith({ endedAt: '2026-11-19T09:25:00.000Z', outcome: 'finished' }),
				workPeriods: [firstWorkPeriod]
			});

			expect(saved).toBe(false);
			expect(await storage.getRunInProgress()).toEqual(savedRunInProgress);
			expect(await storage.getRuns()).toEqual([runInProgress]);
			expect(await storage.getWorkPeriods()).toEqual([]);
		});

		it('refuses a change worked out with none saved once a run in progress is saved, as another tab’s Play', async () => {
			const storage = create();
			await storage.saveRunInProgress(savedRunInProgress, null);
			const otherStart = runInProgressWith({
				record: runWith({ id: 'run-2' }),
				revision: 'revision-2'
			});

			const saved = await storage.saveRunInProgress(otherStart, null, {
				run: runWith({ id: 'run-2' }),
				workPeriods: []
			});

			expect(saved).toBe(false);
			expect(await storage.getRunInProgress()).toEqual(savedRunInProgress);
			expect(await storage.getRuns()).toEqual([]);
		});

		it('refuses a change worked out from a run in progress that has since been forgotten', async () => {
			const storage = create();
			await storage.saveRunInProgress(savedRunInProgress, null);
			await storage.clearRunInProgress('revision-1');

			const saved = await storage.saveRunInProgress(
				runInProgressWith({ revision: 'revision-2' }),
				'revision-1'
			);

			expect(saved).toBe(false);
			expect(await storage.getRunInProgress()).toBeNull();
		});

		it('saves only one of two changes worked out from the same revision, as two tabs pressing at once, so work is saved once', async () => {
			const storage = create();
			await storage.saveRunInProgress(savedRunInProgress, null);
			const fromFirstTab = runInProgressWith({ revision: 'first-tab' });
			const fromSecondTab = runInProgressWith({ revision: 'second-tab' });

			const saved = await Promise.all([
				storage.saveRunInProgress(fromFirstTab, 'revision-1', {
					run: null,
					workPeriods: [workPeriodWith({ id: 'first-tab-period' })]
				}),
				storage.saveRunInProgress(fromSecondTab, 'revision-1', {
					run: null,
					workPeriods: [workPeriodWith({ id: 'second-tab-period' })]
				})
			]);

			expect(saved.toSorted()).toEqual([false, true]);
			const winner = saved[0] === true ? fromFirstTab : fromSecondTab;
			expect(await storage.getRunInProgress()).toEqual(winner);
			expect(await storage.getWorkPeriods()).toHaveLength(1);
		});
	});

	describe('saveHeartbeat', () => {
		it('moves the heartbeat on, changing nothing else, and says it did', async () => {
			const storage = create();
			await storage.saveRunInProgress(savedRunInProgress, null);

			const saved = await storage.saveHeartbeat('revision-1', '2026-11-19T09:10:01.000Z');

			expect(saved).toBe(true);
			expect(await storage.getRunInProgress()).toEqual(
				runInProgressWith({ heartbeatAt: '2026-11-19T09:10:01.000Z' })
			);
		});

		it('drops a heartbeat for another revision, so a tab that missed a press can’t undo it', async () => {
			const storage = create();
			await storage.saveRunInProgress(savedRunInProgress, null);

			const saved = await storage.saveHeartbeat('revision-0', '2026-11-19T09:10:01.000Z');

			expect(saved).toBe(false);
			expect(await storage.getRunInProgress()).toEqual(savedRunInProgress);
		});

		it('drops a heartbeat earlier than the one saved', async () => {
			const storage = create();
			await storage.saveRunInProgress(savedRunInProgress, null);

			const saved = await storage.saveHeartbeat('revision-1', '2026-11-19T09:09:59.000Z');

			expect(saved).toBe(false);
			expect(await storage.getRunInProgress()).toEqual(savedRunInProgress);
		});

		it('drops a heartbeat when no run in progress is saved, rather than saving one', async () => {
			const storage = create();

			const saved = await storage.saveHeartbeat('revision-1', '2026-11-19T09:10:01.000Z');

			expect(saved).toBe(false);
			expect(await storage.getRunInProgress()).toBeNull();
		});
	});

	describe('getRunInProgress', () => {
		it('returns null from empty storage', async () => {
			const storage = create();

			expect(await storage.getRunInProgress()).toBeNull();
		});

		it('returns a copy, so changing it leaves the saved run in progress unchanged', async () => {
			const storage = create();
			await storage.saveRunInProgress(savedRunInProgress, null);
			const read = await storage.getRunInProgress();
			if (read === null) {
				throw new Error('The run in progress should have been saved.');
			}
			read.heartbeatAt = '2026-11-19T11:00:00.000Z';

			expect(await storage.getRunInProgress()).toEqual(savedRunInProgress);
		});
	});

	describe('watchRunInProgress', () => {
		it('reports the run in progress soon after following starts, and not during the call', async () => {
			const storage = create();
			await storage.saveRunInProgress(savedRunInProgress, null);

			const reports = follow(storage);

			expect(reports.changes).toEqual([]);
			await expect.poll(() => reports.changes).toEqual([savedRunInProgress]);
		});

		it('reports null when no run in progress is saved', async () => {
			const storage = create();

			const reports = follow(storage);

			await expect.poll(() => reports.changes).toEqual([null]);
		});

		it('reports each change: a save, a heartbeat and a forgotten run', async () => {
			const storage = create();
			const reports = follow(storage);
			await expect.poll(() => reports.changes).toEqual([null]);

			await storage.saveRunInProgress(savedRunInProgress, null);
			await expect.poll(() => reports.changes.at(-1)).toEqual(savedRunInProgress);
			await storage.saveHeartbeat('revision-1', '2026-11-19T09:10:01.000Z');
			await expect
				.poll(() => reports.changes.at(-1))
				.toEqual(runInProgressWith({ heartbeatAt: '2026-11-19T09:10:01.000Z' }));
			await storage.clearRunInProgress('revision-1');

			await expect.poll(() => reports.changes.at(-1)).toBeNull();
		});

		it('reports to everything following, as each open tab follows', async () => {
			const storage = create();
			const first = follow(storage);
			const second = follow(storage);

			await storage.saveRunInProgress(savedRunInProgress, null);

			await expect.poll(() => first.changes.at(-1)).toEqual(savedRunInProgress);
			await expect.poll(() => second.changes.at(-1)).toEqual(savedRunInProgress);
		});

		it('reports nothing more once stopped', async () => {
			const storage = create();
			const stopped = follow(storage);
			const still = follow(storage);
			await expect.poll(() => stopped.changes).toEqual([null]);

			stopped.stop();
			await storage.saveRunInProgress(savedRunInProgress, null);

			// Reports go out together, so once the one still following hears, the other would have.
			await expect.poll(() => still.changes.at(-1)).toEqual(savedRunInProgress);
			expect(stopped.changes).toEqual([null]);
		});

		it('reports copies, so changing one leaves the saved run in progress unchanged', async () => {
			const storage = create();
			await storage.saveRunInProgress(savedRunInProgress, null);
			const reports = follow(storage);
			await expect.poll(() => reports.changes).toHaveLength(1);

			requireDefined(reports.changes[0] ?? undefined, 'the run reported').heartbeatAt =
				'2026-11-19T11:00:00.000Z';

			expect(await storage.getRunInProgress()).toEqual(savedRunInProgress);
		});
	});

	describe('clearRunInProgress', () => {
		it('forgets the run in progress, and keeps its run and work periods', async () => {
			const storage = create();
			await storage.saveRunInProgress(savedRunInProgress, null, {
				run: runInProgress,
				workPeriods: [firstWorkPeriod]
			});

			const cleared = await storage.clearRunInProgress('revision-1');

			expect(cleared).toBe(true);
			expect(await storage.getRunInProgress()).toBeNull();
			expect(await storage.getRuns()).toEqual([runInProgress]);
			expect(await storage.getWorkPeriods()).toEqual([firstWorkPeriod]);
		});

		it('does nothing when no run in progress is saved', async () => {
			const storage = create();

			const cleared = await storage.clearRunInProgress('revision-1');

			expect(cleared).toBe(false);
			expect(await storage.getRunInProgress()).toBeNull();
		});

		it('keeps a run in progress with another revision, so a tab that missed a newer run can’t forget it', async () => {
			const storage = create();
			await storage.saveRunInProgress(savedRunInProgress, null);

			const cleared = await storage.clearRunInProgress('revision-0');

			expect(cleared).toBe(false);
			expect(await storage.getRunInProgress()).toEqual(savedRunInProgress);
		});
	});

	describe('getSettings', () => {
		it('returns every default from empty storage', async () => {
			const storage = create();

			expect(await storage.getSettings()).toEqual(DEFAULT_SETTINGS);
		});

		it('returns what was saved, with the defaults for the rest', async () => {
			const storage = create();
			await storage.saveSettings({ theme: 'light', volume: 30 });

			expect(await storage.getSettings()).toEqual({
				...DEFAULT_SETTINGS,
				theme: 'light',
				volume: 30
			});
		});

		it('returns a copy, so changing it leaves the saved settings unchanged', async () => {
			const storage = create();
			await storage.saveSettings({ volume: 30 });
			(await storage.getSettings()).volume = 99;

			expect((await storage.getSettings()).volume).toBe(30);
		});
	});

	describe('saveSettings', () => {
		it('keeps the settings it is not changing, across saves', async () => {
			const storage = create();
			await storage.saveSettings({ theme: 'light' });

			await storage.saveSettings({ volume: 10 });

			const settings = await storage.getSettings();
			expect(settings.theme).toBe('light');
			expect(settings.volume).toBe(10);
		});

		it('saves a false and a null as they are, not as the defaults', async () => {
			const storage = create();
			await storage.saveSettings({ keepScreenAwake: false, lastRoutineId: 'a-routine' });

			await storage.saveSettings({ lastRoutineId: null });

			const settings = await storage.getSettings();
			expect(settings.keepScreenAwake).toBe(false);
			expect(settings.lastRoutineId).toBeNull();
		});

		it('leaves a setting as it is when its change is undefined', async () => {
			const storage = create();
			await storage.saveSettings({ theme: 'light' });

			await storage.saveSettings({ theme: undefined });

			expect((await storage.getSettings()).theme).toBe('light');
		});
	});

	describe('watchSettings', () => {
		/**
		 * Follows a storage's settings, keeping each report.
		 *
		 * @param storage - The storage to follow.
		 * @returns The settings reported so far, which grow, and the way to stop.
		 */
		function followSettings(storage: CadoroStorage): {
			changes: Settings[];
			stop: () => void;
		} {
			const changes: Settings[] = [];
			const stop = storage.watchSettings(
				(settings) => {
					changes.push(settings);
				},
				(error: unknown) => {
					throw new Error('Following the settings failed.', { cause: error });
				}
			);
			return { changes, stop };
		}

		it('reports the defaults soon after following starts, and not during the call', async () => {
			const storage = create();

			const reports = followSettings(storage);

			expect(reports.changes).toEqual([]);
			await expect.poll(() => reports.changes).toEqual([DEFAULT_SETTINGS]);
		});

		it('reports each save, with every setting', async () => {
			const storage = create();
			const reports = followSettings(storage);
			await expect.poll(() => reports.changes).toHaveLength(1);

			await storage.saveSettings({ theme: 'system' });

			await expect
				.poll(() => reports.changes.at(-1))
				.toEqual({ ...DEFAULT_SETTINGS, theme: 'system' });
		});

		it('reports to everything following, as each open tab follows', async () => {
			const storage = create();
			const first = followSettings(storage);
			const second = followSettings(storage);

			await storage.saveSettings({ volume: 5 });

			await expect.poll(() => first.changes.at(-1)?.volume).toBe(5);
			await expect.poll(() => second.changes.at(-1)?.volume).toBe(5);
		});

		it('reports nothing more once stopped', async () => {
			const storage = create();
			const stopped = followSettings(storage);
			const still = followSettings(storage);
			await expect.poll(() => stopped.changes).toHaveLength(1);

			stopped.stop();
			await storage.saveSettings({ volume: 5 });

			// Reports go out together, so once the one still following hears, the other would have.
			await expect.poll(() => still.changes.at(-1)?.volume).toBe(5);
			expect(stopped.changes).toHaveLength(1);
		});
	});

	describe('getRuns', () => {
		it('returns nothing from empty storage', async () => {
			const storage = create();

			expect(await storage.getRuns()).toEqual([]);
		});

		it('returns the runs in the order they started, whatever order they were saved in', async () => {
			const storage = create();
			await storage.saveRunInProgress(savedRunInProgress, null, {
				run: runWith({ id: 'afternoon', startedAt: '2026-11-19T14:00:00.000Z' }),
				workPeriods: []
			});
			await storage.saveRunInProgress(savedRunInProgress, 'revision-1', {
				run: runWith({ id: 'morning', startedAt: '2026-11-19T09:00:00.000Z' }),
				workPeriods: []
			});

			const runs = await storage.getRuns();

			expect(runs.map((run) => run.id)).toEqual(['morning', 'afternoon']);
		});

		it('returns copies, so changing one leaves the saved run unchanged', async () => {
			const storage = create();
			await storage.saveRunInProgress(savedRunInProgress, null, {
				run: runInProgress,
				workPeriods: []
			});
			const [read] = await storage.getRuns();
			requireDefined(read, 'the saved run').roundsReached = 5;

			expect(await storage.getRuns()).toEqual([runInProgress]);
		});
	});

	describe('getWorkPeriods', () => {
		it('returns nothing from empty storage', async () => {
			const storage = create();

			expect(await storage.getWorkPeriods()).toEqual([]);
		});

		it('returns the work periods in the order they started, whatever order they were saved in', async () => {
			const storage = create();
			await storage.saveRunInProgress(savedRunInProgress, null, {
				run: null,
				workPeriods: [
					workPeriodWith({
						id: 'second',
						segments: [{ start: '2026-11-19T09:30:00.000Z', end: '2026-11-19T09:55:00.000Z' }]
					}),
					workPeriodWith({
						id: 'first',
						segments: [{ start: '2026-11-19T09:00:00.000Z', end: '2026-11-19T09:25:00.000Z' }]
					})
				]
			});

			const periods = await storage.getWorkPeriods();

			expect(periods.map((period) => period.id)).toEqual(['first', 'second']);
		});

		it('returns copies, so changing one leaves the saved work period unchanged', async () => {
			const storage = create();
			await storage.saveRunInProgress(savedRunInProgress, null, {
				run: null,
				workPeriods: [firstWorkPeriod]
			});
			const [read] = await storage.getWorkPeriods();
			const readSegment = requireDefined(read?.segments[0], "the saved work period's segment");
			readSegment.end = '2026-11-19T11:00:00.000Z';

			expect(await storage.getWorkPeriods()).toEqual([firstWorkPeriod]);
		});
	});

	describe('hasWorkPeriods', () => {
		it('says no for empty storage, and while only a run is saved', async () => {
			const storage = create();
			expect(await storage.hasWorkPeriods()).toBe(false);

			await storage.saveRunInProgress(savedRunInProgress, null, {
				run: runInProgress,
				workPeriods: []
			});

			expect(await storage.hasWorkPeriods()).toBe(false);
		});

		it('says yes once a work period is saved', async () => {
			const storage = create();

			await storage.saveRunInProgress(savedRunInProgress, null, {
				run: runInProgress,
				workPeriods: [firstWorkPeriod]
			});

			expect(await storage.hasWorkPeriods()).toBe(true);
		});
	});

	describe('readBackupData', () => {
		it('reads empty storage as no records and the default settings', async () => {
			const storage = create();

			expect(await storage.readBackupData()).toEqual({
				routines: [],
				runs: [],
				workPeriods: [],
				settings: DEFAULT_SETTINGS
			});
		});

		it('reads every routine, deleted ones too, with the runs, work periods and settings', async () => {
			const storage = await storageWithAbc(create);
			await storage.deleteRoutine('c');
			await storage.saveSettings({ volume: 30 });
			const runOfA = runWith({ routineId: 'a' });
			const periodOfA = workPeriodWith({ routineId: 'a' });
			await storage.saveRunInProgress(savedRunInProgress, null, {
				run: runOfA,
				workPeriods: [periodOfA]
			});

			const data = await storage.readBackupData();

			expect(data.routines.map((routine) => `${routine.id}:${routine.deletedAt !== null}`)).toEqual(
				['a:false', 'b:false', 'c:true']
			);
			expect(data.runs).toEqual([runOfA]);
			expect(data.workPeriods).toEqual([periodOfA]);
			expect(data.settings).toEqual({ ...DEFAULT_SETTINGS, volume: 30 });
		});

		it('leaves out the run in progress and the activity log', async () => {
			const storage = await storageWithAbc(create);
			await storage.deleteRoutine('c');
			await storage.saveRunInProgress(savedRunInProgress, null);

			const data = await storage.readBackupData();

			expect(Object.keys(data).toSorted()).toEqual(['routines', 'runs', 'settings', 'workPeriods']);
		});

		it('returns copies, so changing them leaves the saved data unchanged', async () => {
			const storage = await storageWithAbc(create);

			requireDefined((await storage.readBackupData()).routines[0], 'a routine').title = 'Changed';

			expect((await storage.getAllRoutines())[0]?.title).toBe('A');
		});
	});

	describe('replaceAllData', () => {
		/** What an import brings: two routines, one deleted, a run with its work period, settings. */
		const imported: BackupData = {
			routines: [
				routineWith({ id: 'x', title: 'X', customPosition: 0 }),
				routineWith({
					id: 'y',
					title: 'Y',
					customPosition: 1,
					deletedAt: '2026-11-18T09:00:00.000Z'
				})
			],
			runs: [runWith({ id: 'imported-run', routineId: 'x' })],
			workPeriods: [
				workPeriodWith({ id: 'imported-period', runId: 'imported-run', routineId: 'x' })
			],
			settings: { ...DEFAULT_SETTINGS, theme: 'light', volume: 12, lastRoutineId: 'x' }
		};

		/** What the imported backup holds, as its summary counts it. */
		const summary: BackupSummary = {
			formatVersion: 1,
			exportedAt: '2026-11-17T08:00:00.000Z',
			routineCount: 2,
			runCount: 1,
			workPeriodCount: 1,
			firstRunAt: '2026-11-19T09:00:00.000Z',
			lastRunAt: '2026-11-19T09:00:00.000Z'
		};

		/**
		 * Makes storage with data of its own, which an import must replace: three routines, a run
		 * with a work period, changed settings and a run in progress.
		 *
		 * @returns The storage.
		 */
		async function storageWithOldData(): Promise<CadoroStorage> {
			const storage = await storageWithAbc(create);
			await storage.saveSettings({ volume: 99, targetChime: 'old-chime' });
			await storage.saveRunInProgress(savedRunInProgress, null, {
				run: runWith({ id: 'old-run', routineId: 'a' }),
				workPeriods: [workPeriodWith({ id: 'old-period', runId: 'old-run', routineId: 'a' })]
			});
			return storage;
		}

		it('replaces the routines, runs, work periods and settings with the imported ones', async () => {
			const storage = await storageWithOldData();

			await storage.replaceAllData(imported, summary);

			expect(await storage.readBackupData()).toEqual(imported);
			expect((await storage.getRoutines()).map((routine) => routine.id)).toEqual(['x']);
		});

		it('replaces the old settings with the imported ones, not merging them', async () => {
			const storage = await storageWithOldData();

			await storage.replaceAllData(imported, summary);

			expect(await storage.getSettings()).toEqual(imported.settings);
		});

		it('forgets the run in progress', async () => {
			const storage = await storageWithOldData();

			await storage.replaceAllData(imported, summary);

			expect(await storage.getRunInProgress()).toBeNull();
		});

		it('imports into empty storage', async () => {
			const storage = create();

			await storage.replaceAllData(imported, summary);

			expect(await storage.readBackupData()).toEqual(imported);
		});

		it('imports a backup that holds nothing, emptying the storage', async () => {
			const storage = await storageWithOldData();
			const nothing: BackupData = {
				routines: [],
				runs: [],
				workPeriods: [],
				settings: DEFAULT_SETTINGS
			};

			await storage.replaceAllData(nothing, {
				...summary,
				routineCount: 0,
				runCount: 0,
				workPeriodCount: 0
			});

			expect(await storage.readBackupData()).toEqual(nothing);
			expect(await storage.hasWorkPeriods()).toBe(false);
		});

		it('keeps the old log entries and adds an entry with what was imported', async () => {
			const storage = await storageWithOldData();
			await storage.deleteRoutine('c');

			await storage.replaceAllData(imported, summary);

			const entries = await storage.getLogEntries();
			expect(entries.map((entry) => entry.message)).toEqual([
				'Imported a backup',
				'Deleted routine "C"'
			]);
			expect(entries[0]).toMatchObject({
				type: 'change',
				timestamp: NOW,
				details: {
					action: 'import',
					formatVersion: 1,
					exportedAt: '2026-11-17T08:00:00.000Z',
					routines: 2,
					runs: 1,
					workPeriods: 1
				}
			});
		});

		it('keeps only the newest entries once the import takes the log over its limit', async () => {
			const storage = await storageWithAbc(create, { ...atNow, logLimit: 2 });
			await storage.saveRoutine(routineWith({ id: 'a', title: 'one' }));
			await storage.saveRoutine(routineWith({ id: 'a', title: 'two' }));

			await storage.replaceAllData(imported, summary);

			expect((await storage.getLogEntries()).map((entry) => entry.message)).toEqual([
				'Imported a backup',
				'Edited routine "two"'
			]);
		});

		it('refuses data where two routines share an id, and changes nothing', async () => {
			const storage = await storageWithOldData();
			const before = await storage.readBackupData();
			const repeated: BackupData = {
				...imported,
				routines: [routineWith({ id: 'same' }), routineWith({ id: 'same' })]
			};

			await expect(storage.replaceAllData(repeated, summary)).rejects.toThrow();

			expect(await storage.readBackupData()).toEqual(before);
			expect(await storage.getRunInProgress()).toEqual(savedRunInProgress);
			expect(await storage.getLogEntries()).toEqual([]);
		});

		it('refuses data where two work periods share an id, after the routines and runs went in', async () => {
			const storage = await storageWithOldData();
			const before = await storage.readBackupData();
			const repeated: BackupData = {
				...imported,
				workPeriods: [workPeriodWith({ id: 'same' }), workPeriodWith({ id: 'same' })]
			};

			await expect(storage.replaceAllData(repeated, summary)).rejects.toThrow();

			expect(await storage.readBackupData()).toEqual(before);
			expect(await storage.getRunInProgress()).toEqual(savedRunInProgress);
		});

		it('tells the followers of the routines, the settings and the run in progress', async () => {
			const storage = await storageWithOldData();
			const routineReports: string[][] = [];
			const settingsReports: number[] = [];
			const runReports = follow(storage);
			storage.watchRoutines(
				(routines) => routineReports.push(routines.map((routine) => routine.id)),
				() => {}
			);
			storage.watchSettings(
				(settings) => settingsReports.push(settings.volume),
				() => {}
			);
			await expect.poll(() => routineReports.length).toBeGreaterThan(0);

			await storage.replaceAllData(imported, summary);

			await expect.poll(() => routineReports.at(-1)).toEqual(['x']);
			await expect.poll(() => settingsReports.at(-1)).toBe(12);
			await expect.poll(() => runReports.changes.at(-1)).toBeNull();
			runReports.stop();
		});
	});

	describe('a backup of the app’s own data', () => {
		/**
		 * Presses a button on the run engine and saves the change as the timer session does: the
		 * run's records from `recordPress`, with the run in progress.
		 *
		 * @param storage - Where to save.
		 * @param state - The run so far, with its record and the revision saved last.
		 * @param button - The engine's function for the button.
		 * @param at - The moment of the press, in milliseconds since 1970 (UTC).
		 * @returns The state after the press.
		 * @throws {@link Error} If the press leaves the run ready or without a record, which none of
		 * the presses here does.
		 */
		async function press(
			storage: CadoroStorage,
			state: PressState,
			button: (run: RunState, now: number) => RunState,
			at: number
		): Promise<PressState> {
			const after = button(state.run, at);
			if (after.status === 'ready') {
				throw new Error('A button press left the run ready.');
			}
			const records = recordPress(
				{ before: state.run, after, now: at, routineId: 'one-round', record: state.record },
				newIds
			);
			const record = records.run ?? state.record;
			const revision = newRevisions();
			if (record === null) {
				throw new Error('A button press left no run record.');
			}
			const stored = toStoredRunInProgress(record, after, at, revision);
			await storage.saveRunInProgress(stored, state.revision, records);
			return { run: after, record, revision };
		}

		/** Numbers the ids of the records the engine's presses make. */
		const newIds = numberedIds('made');
		/** Numbers the revisions of the saves. */
		const newRevisions = numberedIds('revision');

		/**
		 * Makes storage the way a user does: routines created, edited and deleted, a run with a pause
		 * played through the engine and saved press by press, and settings changed.
		 *
		 * @returns The storage.
		 */
		async function storageUsedByTheApp(): Promise<CadoroStorage> {
			const storage = create(atNow);
			await storage.addRoutinesIfNone([oneRoundRoutine]);
			await storage.createRoutine(
				routineWith({ id: 'made', title: 'Made, "quoted"', customPosition: 1 })
			);
			await storage.saveRoutine(routineWith({ id: 'made', title: 'Edited', rounds: 'infinite' }));
			await storage.createRoutine(
				routineWith({ id: 'doomed', title: 'Doomed', customPosition: 2 })
			);
			await storage.deleteRoutine('doomed');

			const start = Date.parse('2026-11-19T09:00:00.000Z');
			let state: PressState = { run: createRun(oneRoundRoutine), record: null, revision: null };
			state = await press(storage, state, play, start);
			state = await press(storage, state, pause, start + minutes(10));
			state = await press(storage, state, play, start + minutes(20));
			await press(storage, state, next, start + minutes(30) + 123);

			await storage.saveSettings({ theme: 'light', volume: 30, lastRoutineId: 'one-round' });
			return storage;
		}

		it('is accepted by the validation, and importing it gives equal data', async () => {
			const original = await storageUsedByTheApp();
			const data = await original.readBackupData();

			const text = serializeBackup(createBackup(data, new Date(NOW)));
			const parsed = parseBackup(text);

			expect(parsed.ok).toBe(true);
			if (!parsed.ok) return;
			const restored = create(atNow);
			await restored.replaceAllData(parsed.backup, summarizeBackup(parsed.backup));
			expect(await restored.readBackupData()).toEqual(data);
		});

		it('holds a run made by the engine, with its pause and its time worked to the millisecond', async () => {
			const data = await (await storageUsedByTheApp()).readBackupData();

			expect(data.runs).toHaveLength(1);
			expect(data.workPeriods).toHaveLength(1);
			expect(data.workPeriods[0]?.segments).toHaveLength(2);
			expect(data.workPeriods[0]?.workedMs).toBe(minutes(20) + 123);
			expect(data.routines.map((routine) => routine.id)).toEqual(['one-round', 'made', 'doomed']);
		});
	});
});
