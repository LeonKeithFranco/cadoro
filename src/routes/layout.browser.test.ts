import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { useErrorLog } from '#lib/error-log.ts';
import { DexieStorage } from '#lib/storage/dexie-storage.ts';
import type { TimerSession } from '#lib/timer.svelte.ts';
import { runInProgressWith, savedRunInProgress } from '#lib/testing/run-in-progress.ts';
import { oneRoundRoutine, routineWith } from '#lib/testing/routines.ts';
import { firstWorkPeriod, runInProgress, runWith } from '#lib/testing/run-records.ts';
import { withRoutines } from '#lib/testing/storage.ts';
import type { RoutineUsageKeeper } from '#lib/routine-usage.svelte.ts';
import type { RunChimes } from '#lib/run-chimes.svelte.ts';

/** The name of the database the layout's `load` opens, which these tests empty before each test. */
const APP_DATABASE_NAME = 'cadoro';

/** How many times {@link freshLoad} has imported the layout, which makes each import's query new. */
let importCount = 0;

/** What the layout's `load` returns that these tests use. */
type LoadedApp = {
	/** The app's one timer session. */
	timerSession: TimerSession;
	/** The runs and work periods the picker sorts by, read again on request. */
	routineUsage: RoutineUsageKeeper;
	/** The app's chimes, whose timer a test clears once it ends. */
	chimes: RunChimes;
};

/**
 * Imports the layout's module as it is when the app first opens, with no session made yet, since
 * the module keeps the session in a variable of its own.
 *
 * @remarks
 * Browser mode can't reset the modules between tests, so each import adds a query that Vite takes
 * for a module of its own.
 *
 * @returns A promise of the module's `load`, which opens the app.
 */
async function freshLoad(): Promise<() => Promise<LoadedApp>> {
	importCount += 1;
	const layout = (await import(
		/* @vite-ignore */ `./+layout.ts?fresh=${importCount}`
	)) as typeof import('./+layout.ts');
	return async () => {
		const app = (await layout.load({} as Parameters<typeof layout.load>[0])) as LoadedApp;
		chimesOfLoadedApps.push(app.chimes);
		return app;
	};
}

/** The chimes of every app a test loaded, which are destroyed once the test ends. */
const chimesOfLoadedApps: RunChimes[] = [];

/**
 * Saves a finished work period in the app's database, as if work was done in an earlier visit,
 * leaving no run in progress.
 *
 * @returns A promise that resolves once the work period is saved.
 */
async function saveEarlierWork(): Promise<void> {
	// The run's routine, which storage requires to be saved before a run of it.
	const storage = await withRoutines(new DexieStorage(), [oneRoundRoutine]);
	await storage.saveRunInProgress(savedRunInProgress, null, {
		run: runInProgress,
		workPeriods: [firstWorkPeriod]
	});
	await storage.clearRunInProgress(runInProgressWith({}).revision);
}

describe('the root layout’s load', () => {
	/** The browser's check for persistent storage, which says it isn't persistent yet. */
	let persisted: MockInstance<() => Promise<boolean>>;
	/** The browser's request for persistent storage, which the tests count. */
	let persist: MockInstance<() => Promise<boolean>>;

	// Starts every test with no data and a browser that doesn't yet keep storage persistent.
	beforeEach(async () => {
		await Dexie.delete(APP_DATABASE_NAME);
		persisted = vi.spyOn(navigator.storage, 'persisted').mockResolvedValue(false);
		persist = vi.spyOn(navigator.storage, 'persist').mockResolvedValue(true);
	});

	// Closes the apps the test loaded, so no chimes timer keeps running, puts back the browser's own
	// storage manager, and takes away the log the app chose for errors.
	afterEach(() => {
		for (const chimes of chimesOfLoadedApps.splice(0)) {
			chimes.destroy();
		}
		vi.restoreAllMocks();
		useErrorLog(null);
	});

	it('hands back the same session when it runs again, as after invalidateAll', async () => {
		const load = await freshLoad();

		const first = await load();
		const second = await load();

		expect(second.timerSession).toBe(first.timerSession);
	});

	it('picks the fallback routine with the usage the Timer’s picker reads, not the usage at launch', async () => {
		const storage = await withRoutines(new DexieStorage(), [
			routineWith({ id: 'a', customPosition: 0 }),
			routineWith({ id: 'b', customPosition: 1 }),
			routineWith({ id: 'c', customPosition: 2 })
		]);
		await storage.saveSettings({ routineSort: 'last-used', lastRoutineId: 'a' });
		const load = await freshLoad();
		const { timerSession, routineUsage } = await load();
		// A run of c, saved after the app opened, which the picker then reads.
		await storage.saveRunInProgress(savedRunInProgress, null, {
			run: runWith({ routineId: 'c' }),
			workPeriods: []
		});
		await storage.clearRunInProgress(savedRunInProgress.revision);
		await routineUsage.reload();

		// The ready run's routine, a, is deleted, so the session falls back to the picker's first.
		await storage.deleteRoutine('a');

		await expect.poll(() => timerSession.routine.id).toBe('c');
	});

	it('does not ask for persistent storage when the app opens with no work saved', async () => {
		const load = await freshLoad();

		await load();

		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(persist).not.toHaveBeenCalled();
	});

	it('asks for persistent storage as the app opens when work is already saved', async () => {
		await saveEarlierWork();
		const load = await freshLoad();

		await load();

		await expect.poll(() => persist.mock.calls).toHaveLength(1);
	});

	it('asks for persistent storage once the first work period is saved', async () => {
		const load = await freshLoad();
		const { timerSession } = await load();

		timerSession.play();
		timerSession.next();

		await expect.poll(() => persist.mock.calls).toHaveLength(1);
	});

	it('records an error in the activity log kept in storage', async () => {
		await saveEarlierWork();
		persisted.mockRejectedValue(new Error('The browser said no.'));
		const load = await freshLoad();

		await load();

		await expect.poll(() => new DexieStorage().getLogEntries()).toHaveLength(1);
		expect((await new DexieStorage().getLogEntries())[0]).toMatchObject({
			type: 'error',
			message: 'Persistent storage could not be requested.',
			details: { message: 'The browser said no.' }
		});
	});
});
