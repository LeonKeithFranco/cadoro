import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { useErrorLog } from '#lib/error-log.ts';
import { DexieStorage } from '#lib/storage/dexie-storage.ts';
import type { TimerSession } from '#lib/timer.svelte.ts';
import { runInProgressWith, savedRunInProgress } from '#lib/testing/run-in-progress.ts';
import { firstWorkPeriod, runInProgress } from '#lib/testing/run-records.ts';

/** The name of the database the layout's `load` opens, which these tests empty before each test. */
const APP_DATABASE_NAME = 'cadoro';

/** How many times {@link freshLoad} has imported the layout, which makes each import's query new. */
let importCount = 0;

/** What the layout's `load` returns that these tests use. */
type LoadedApp = {
	/** The app's one timer session. */
	timerSession: TimerSession;
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
	return async () => (await layout.load({} as Parameters<typeof layout.load>[0])) as LoadedApp;
}

/**
 * Saves a finished work period in the app's database, as if work was done in an earlier visit,
 * leaving no run in progress.
 *
 * @returns A promise that resolves once the work period is saved.
 */
async function saveEarlierWork(): Promise<void> {
	const storage = new DexieStorage();
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

	// Puts back the browser's own storage manager, and takes away the log the app chose for errors.
	afterEach(() => {
		vi.restoreAllMocks();
		useErrorLog(null);
	});

	it('hands back the same session when it runs again, as after invalidateAll', async () => {
		const load = await freshLoad();

		const first = await load();
		const second = await load();

		expect(second.timerSession).toBe(first.timerSession);
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
