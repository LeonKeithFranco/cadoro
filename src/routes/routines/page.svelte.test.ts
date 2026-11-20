import { page } from 'vitest/browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { useErrorLog } from '#lib/error-log.ts';
import type { Routine } from '#lib/routine.ts';
import { DEFAULT_SETTINGS, type Settings } from '#lib/settings.ts';
import { RoutineUsageKeeper } from '#lib/routine-usage.svelte.ts';
import { SettingsSession } from '#lib/settings.svelte.ts';
import type { InMemoryStorage } from '#lib/storage/in-memory-storage.ts';
import { numberedIds } from '#lib/testing/ids.ts';
import { routineWith } from '#lib/testing/routines.ts';
import { savedRunInProgress } from '#lib/testing/run-in-progress.ts';
import { runWith } from '#lib/testing/run-records.ts';
import { storageHolding } from '#lib/testing/storage.ts';
import { TimerSession } from '#lib/timer.svelte.ts';
import type { PageProps } from './$types';
import RoutinesPage from './+page.svelte';

// Takes away the log a test chose for errors.
afterEach(() => {
	useErrorLog(null);
});

/**
 * Makes the routines the tests list.
 *
 * @returns Alpha, Bravo and Charlie, in that custom order.
 */
function threeRoutines(): Routine[] {
	return [
		routineWith({ id: 'a', title: 'Alpha', customPosition: 0 }),
		routineWith({ id: 'b', title: 'Bravo', customPosition: 1 }),
		routineWith({ id: 'c', title: 'Charlie', customPosition: 2 })
	];
}

/**
 * Makes the data the Routines page reads from the root layout, with routine usage that knows of
 * no runs, as if every run was saved after the app opened.
 *
 * @param storage - The app's storage, holding the routines.
 * @param routines - The routines the app opened with.
 * @param settings - The settings that differ from the defaults, such as the routine sort.
 * @returns The timer session, settings session, storage and routine usage, as `load` makes them.
 */
function pageData(
	storage: InMemoryStorage,
	routines: Routine[],
	settings: Partial<Settings> = {}
): PageProps['data'] {
	const timerSession = new TimerSession(
		routines,
		{
			clock: (): number => 0,
			storage,
			newId: numberedIds(),
			newRevision: numberedIds('revision'),
			onWorkSaved: vi.fn()
		},
		{ saved: null, isAnotherTabOpen: false }
	);
	const settingsSession = new SettingsSession(storage, { ...DEFAULT_SETTINGS, ...settings });
	const routineUsage = new RoutineUsageKeeper(storage, { runs: [], workPeriods: [] });
	return { timerSession, settingsSession, storage, routineUsage } as unknown as PageProps['data'];
}

/**
 * Reads the titles of the routines in the list, top to bottom.
 *
 * @returns The titles, from each card's heading.
 */
function listedTitles(): string[] {
	return page
		.getByRole('list', { name: 'Routines' })
		.getByRole('heading', { level: 2 })
		.elements()
		.map((heading) => heading.textContent);
}

describe('the Routines page', () => {
	it('reads the runs again as it opens, and sorts by last used from them', async () => {
		const routines = threeRoutines();
		const storage = storageHolding(routines);
		await storage.saveRunInProgress(savedRunInProgress, null, {
			run: runWith({ id: 'run-1', routineId: 'c', startedAt: '2026-11-18T09:00:00.000Z' }),
			workPeriods: []
		});
		// Saved too, since the settings session follows what storage holds.
		await storage.saveSettings({ routineSort: 'last-used' });

		render(RoutinesPage, {
			data: pageData(storage, routines, { routineSort: 'last-used' }),
			params: {}
		});

		await expect.poll(listedTitles).toEqual(['Charlie', 'Alpha', 'Bravo']);
	});

	it('records in the activity log that the runs could not be read, and still lists the routines', async () => {
		const routines = threeRoutines();
		const storage = storageHolding(routines);
		useErrorLog(storage);
		vi.spyOn(storage, 'getRuns').mockRejectedValue(new Error('The disk could not be read.'));

		render(RoutinesPage, { data: pageData(storage, routines), params: {} });

		await expect.poll(() => storage.getLogEntries()).toHaveLength(1);
		expect((await storage.getLogEntries())[0]).toMatchObject({
			type: 'error',
			message: 'The runs could not be read, so "last used" and "most work" may be out of order.',
			details: { message: 'The disk could not be read.' }
		});
		await expect.poll(listedTitles).toEqual(['Alpha', 'Bravo', 'Charlie']);
	});
});
