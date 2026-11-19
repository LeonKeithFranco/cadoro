import { page } from 'vitest/browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { useErrorLog } from '#lib/error-log.ts';
import { createStarterRoutines } from '#lib/routine.ts';
import { DEFAULT_SETTINGS } from '#lib/settings.ts';
import { SettingsSession } from '#lib/settings.svelte.ts';
import { InMemoryStorage } from '#lib/storage/in-memory-storage.ts';
import type { CadoroStorage } from '#lib/storage/storage.ts';
import { numberedIds } from '#lib/testing/ids.ts';
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
 * @returns The timer session, settings session and storage, as `load` makes them.
 */
function pageData(storage: CadoroStorage): PageProps['data'] {
	const routines = createStarterRoutines(new Date(0), numberedIds());
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
	const settingsSession = new SettingsSession(storage, DEFAULT_SETTINGS);
	return { timerSession, settingsSession, storage } as unknown as PageProps['data'];
}

describe('the Timer page', () => {
	it('shows the Timer screen', async () => {
		render(TimerPage, { data: pageData(new InMemoryStorage()), params: {} });

		await expect.element(page.getByRole('heading', { level: 1, name: 'Timer' })).toBeVisible();
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
