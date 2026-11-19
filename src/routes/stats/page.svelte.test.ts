import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { InMemoryStorage } from '#lib/storage/in-memory-storage.ts';
import { oneRoundRoutine } from '#lib/testing/routines.ts';
import { runInProgressWith } from '#lib/testing/run-in-progress.ts';
import { runInProgress as startedRecord } from '#lib/testing/run-records.ts';
import type { StoredRunInProgress } from '#lib/run-in-progress.ts';
import type { PageProps } from './$types';
import StatsPage from './+page.svelte';

/** The moment the fake clock stands at, in milliseconds since 1970 (UTC). */
const START = Date.parse('2026-11-19T12:00:00Z');

/** One minute in milliseconds. */
const MINUTE = 60_000;

// Fakes only the clock and the interval, so the page reads a moment the test controls while the
// test's own polling keeps its real timers.
beforeEach(() => {
	vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
	vi.setSystemTime(START);
});

afterEach(() => {
	vi.useRealTimers();
});

/**
 * Makes a run in progress in its first work period, counting since a moment.
 *
 * @param minutesAgo - How many minutes before the fake clock's start the stretch began.
 * @returns The run in progress, which counts.
 */
function countingSince(minutesAgo: number): StoredRunInProgress {
	return runInProgressWith({
		record: startedRecord,
		run: {
			status: 'working',
			endedPeriods: [],
			position: { round: 0, block: 0, cycle: 0 },
			segments: [],
			runningSince: new Date(START - minutesAgo * MINUTE).toISOString()
		}
	});
}

/**
 * Renders the Stats page with the given storage and run in progress, as its `load` gives them.
 *
 * @param storage - The storage the page follows.
 * @param runInProgress - The run in progress the `load` read.
 */
async function renderStats(
	storage: InMemoryStorage,
	runInProgress: StoredRunInProgress | null
): Promise<void> {
	if (runInProgress !== null) {
		await storage.saveRunInProgress(runInProgress, null, { run: startedRecord, workPeriods: [] });
	}
	const data = {
		storage,
		routines: [oneRoundRoutine],
		workPeriods: [],
		runInProgress
	} as unknown as PageProps['data'];
	render(StatsPage, { data, params: {} });
}

/**
 * Reads the value of one of the headline figures.
 *
 * @param label - The figure's label, such as `All time`.
 * @returns A function that reads its text, for `expect.poll`.
 */
function figure(label: string): () => string | undefined {
	return () =>
		[...document.querySelectorAll('dt')]
			.find((term) => term.textContent === label)
			?.nextElementSibling?.textContent?.trim();
}

describe('the Stats page and the run in progress', () => {
	it('counts the work period that is counting, up to now', async () => {
		await renderStats(new InMemoryStorage(), countingSince(20));

		await expect.poll(figure('All time')).toBe('20:00');
	});

	it('counts the work of a run that another tab starts after the page opens', async () => {
		const storage = new InMemoryStorage();
		await renderStats(storage, null);

		await storage.saveRunInProgress(countingSince(5), null, {
			run: startedRecord,
			workPeriods: []
		});

		await expect.poll(figure('All time')).toBe('5:00');
	});

	it('keeps counting as time passes', async () => {
		await renderStats(new InMemoryStorage(), countingSince(20));
		await expect.poll(figure('All time')).toBe('20:00');

		vi.advanceTimersByTime(3 * MINUTE);

		await expect.poll(figure('All time')).toBe('23:00');
	});
});
