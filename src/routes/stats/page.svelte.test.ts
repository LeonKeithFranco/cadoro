import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { InMemoryStorage } from '#lib/storage/in-memory-storage.ts';
import { oneRoundRoutine } from '#lib/testing/routines.ts';
import { runInProgressWith } from '#lib/testing/run-in-progress.ts';
import { runInProgress as startedRecord } from '#lib/testing/run-records.ts';
import type { StoredRunInProgress } from '#lib/run-in-progress.ts';
import type { WorkPeriod } from '#lib/run-records.ts';
import { workPeriodWith } from '#lib/testing/run-records.ts';
import type { PageProps } from './$types';
import StatsPage from './+page.svelte';

/** The moment the fake clock stands at, in milliseconds since 1970 (UTC). */
const START = Date.parse('2026-11-19T12:00:00Z');

/** One minute in milliseconds. */
const MINUTE = 60_000;

// Fakes only the clock and the interval, so the page reads a moment the test controls while the
// test's own polling keeps its real timers.
beforeEach(() => {
	vi.useFakeTimers({
		toFake: ['Date', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout']
	});
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
 * @param workPeriods - The work periods the `load` read.
 */
async function renderStats(
	storage: InMemoryStorage,
	runInProgress: StoredRunInProgress | null,
	workPeriods: WorkPeriod[] = []
): Promise<void> {
	await storage.addRoutinesIfNone([oneRoundRoutine]);
	if (runInProgress !== null) {
		await storage.saveRunInProgress(runInProgress, null, { run: startedRecord, workPeriods: [] });
	}
	const data = {
		storage,
		routines: [oneRoundRoutine],
		workPeriods,
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

describe('the Stats page when the work period in progress ends', () => {
	it('keeps its work in the figures, now as a saved work period, without dropping to zero', async () => {
		const storage = new InMemoryStorage();
		await renderStats(storage, countingSince(20));
		await expect.poll(figure('All time')).toBe('20:00');

		// Another tab presses Next: the period is saved and the run moves on to its break.
		await storage.saveRunInProgress(
			runInProgressWith({
				record: startedRecord,
				run: {
					status: 'break',
					endedPeriods: [],
					position: { round: 0, block: 0, cycle: 0 },
					nextWorkPosition: { round: 0, block: 0, cycle: 1 },
					earnedMs: 4 * MINUTE,
					remainingMs: 4 * MINUTE,
					runningSince: new Date(START).toISOString()
				},
				revision: 'revision-2'
			}),
			'revision-1',
			{
				run: null,
				workPeriods: [
					workPeriodWith({
						id: 'ended-period',
						segments: [
							{
								start: new Date(START - 20 * MINUTE).toISOString(),
								end: new Date(START).toISOString()
							}
						],
						workedMs: 20 * MINUTE
					})
				]
			}
		);
		await vi.advanceTimersByTimeAsync(100);

		expect(figure('All time')()).toBe('20:00');
		expect(figure('Targets reached')()).toBe('0%');
	});

	it('keeps what it shows when reading the work periods fails', async () => {
		const storage = new InMemoryStorage();
		await renderStats(storage, countingSince(20));
		await expect.poll(figure('All time')).toBe('20:00');
		vi.spyOn(storage, 'getWorkPeriods').mockRejectedValue(new Error('unreadable'));
		const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);

		await storage.saveRunInProgress(
			runInProgressWith({ record: startedRecord, revision: 'revision-2' }),
			'revision-1',
			{ run: null, workPeriods: [] }
		);
		await vi.advanceTimersByTimeAsync(100);

		expect(logged).toHaveBeenCalled();
		expect(figure('All time')()).toBe('20:00');
	});
});

/**
 * Makes a work period of ten minutes on a local day, ending at 23:50, in the browser's own time
 * zone, which the tests can't pin.
 *
 * @returns The work period.
 */
function lateWorkOnNov19(): WorkPeriod {
	const start = new Date(2026, 10, 19, 23, 40);
	const end = new Date(2026, 10, 19, 23, 50);
	return workPeriodWith({
		segments: [{ start: start.toISOString(), end: end.toISOString() }],
		workedMs: 10 * MINUTE
	});
}

describe('the Stats page left open past midnight', () => {
	it('shows the new day as today when local midnight passes', async () => {
		vi.setSystemTime(new Date(2026, 10, 19, 23, 59));
		await renderStats(new InMemoryStorage(), null, [lateWorkOnNov19()]);
		await expect.poll(figure('Today')).toBe('10:00');

		vi.advanceTimersByTime(2 * MINUTE);

		await expect.poll(figure('Today')).toBe('0:00');
	});

	it('shows the new day as today when the page becomes visible again after midnight', async () => {
		vi.setSystemTime(new Date(2026, 10, 19, 23, 59));
		await renderStats(new InMemoryStorage(), null, [lateWorkOnNov19()]);
		await expect.poll(figure('Today')).toBe('10:00');

		// The device slept through midnight, so no timer ran.
		vi.setSystemTime(new Date(2026, 10, 20, 9, 0));
		document.dispatchEvent(new Event('visibilitychange'));

		await expect.poll(figure('Today')).toBe('0:00');
	});
});
