import { page } from 'vitest/browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { useErrorLog } from '#lib/error-log.ts';
import { createStarterRoutines, type Routine } from '#lib/routine.ts';
import { DEFAULT_SETTINGS, type Settings } from '#lib/settings.ts';
import { RoutineUsageKeeper } from '#lib/routine-usage.svelte.ts';
import { SettingsSession } from '#lib/settings.svelte.ts';
import { InMemoryStorage } from '#lib/storage/in-memory-storage.ts';
import type { CadoroStorage } from '#lib/storage/storage.ts';
import { minutes } from '#lib/testing/durations.ts';
import { numberedIds } from '#lib/testing/ids.ts';
import { routineWith } from '#lib/testing/routines.ts';
import { savedRunInProgress } from '#lib/testing/run-in-progress.ts';
import { runWith, workPeriodWith } from '#lib/testing/run-records.ts';
import { storageHolding } from '#lib/testing/storage.ts';
import { TimerSession } from '#lib/timer.svelte.ts';
import type { PageProps } from './$types';
import TimerPage from './+page.svelte';

// Takes away the log a test chose for errors.
afterEach(() => {
	useErrorLog(null);
});

/**
 * Makes the data the Timer page reads from the root layout.
 *
 * @param storage - The app's storage.
 * @param settings - The settings that differ from the defaults, such as the routine sort.
 * @param routines - The routines the timer offers, the starter routines unless a test gives others.
 * @returns The timer session, settings session and storage, as `load` makes them.
 */
function pageData(
	storage: CadoroStorage,
	settings: Partial<Settings> = {},
	routines: Routine[] = createStarterRoutines(new Date(0), numberedIds())
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
 * Reads the routines the picker offers, top to bottom.
 *
 * @returns The titles of the picker's options.
 */
function pickerOptions(): string[] {
	return page
		.getByRole('combobox', { name: 'Routine' })
		.getByRole('option')
		.elements()
		.map((option) => option.textContent);
}

describe('the Timer page', () => {
	it('shows the Timer screen', async () => {
		render(TimerPage, { data: pageData(new InMemoryStorage()), params: {} });

		await expect.element(page.getByRole('heading', { level: 1, name: 'Timer' })).toBeVisible();
	});

	it('lists the routines in the picker in the sort chosen on the Routines screen', async () => {
		const routines = [
			routineWith({ id: 'a', title: 'Alpha', customPosition: 0 }),
			routineWith({ id: 'b', title: 'Bravo', customPosition: 1 }),
			routineWith({ id: 'c', title: 'Charlie', customPosition: 2 })
		];

		const storage = new InMemoryStorage();
		// Saved too, since the settings session follows what storage holds.
		await storage.saveSettings({ routineSort: 'title-desc' });

		render(TimerPage, {
			data: pageData(storage, { routineSort: 'title-desc' }, routines),
			params: {}
		});

		await expect.poll(pickerOptions).toEqual(['Charlie', 'Bravo', 'Alpha']);
	});

	it('orders the picker by the work saved when the sort is most work', async () => {
		const routines = [
			routineWith({ id: 'a', title: 'Alpha', customPosition: 0 }),
			routineWith({ id: 'b', title: 'Bravo', customPosition: 1 })
		];
		const storage = storageHolding(routines);
		await storage.saveRunInProgress(savedRunInProgress, null, {
			run: runWith({ id: 'run-1', routineId: 'b' }),
			workPeriods: [workPeriodWith({ id: 'period-1', routineId: 'b', workedMs: minutes(30) })]
		});
		// Saved too, since the settings session follows what storage holds.
		await storage.saveSettings({ routineSort: 'most-work' });

		render(TimerPage, {
			data: pageData(storage, { routineSort: 'most-work' }, routines),
			params: {}
		});

		await expect.poll(pickerOptions).toEqual(['Bravo', 'Alpha']);
	});

	it('records in the activity log that the runs could not be read, and still shows the screen', async () => {
		const storage = new InMemoryStorage();
		useErrorLog(storage);
		vi.spyOn(storage, 'getRuns').mockRejectedValue(new Error('The disk could not be read.'));

		render(TimerPage, { data: pageData(storage), params: {} });

		await expect.poll(() => storage.getLogEntries()).toHaveLength(1);
		expect((await storage.getLogEntries())[0]).toMatchObject({
			type: 'error',
			message: 'The runs could not be read, so the picker may be out of order.',
			details: { message: 'The disk could not be read.' }
		});
		await expect.element(page.getByRole('heading', { level: 1, name: 'Timer' })).toBeVisible();
	});
});
