import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { useErrorLog } from '#lib/error-log.ts';
import { DEFAULT_SETTINGS } from '#lib/settings.ts';
import { InMemoryStorage } from '#lib/storage/in-memory-storage.ts';
import type { CadoroStorage } from '#lib/storage/storage.ts';
import { minutes } from '#lib/testing/durations.ts';
import { recordedErrors } from '#lib/testing/error-log.ts';
import { oneRoundRoutine } from '#lib/testing/routines.ts';
import { runInProgressWith } from '#lib/testing/run-in-progress.ts';
import { runInProgress as startedRecord } from '#lib/testing/run-records.ts';
import type { StoredRunInProgress } from '#lib/run-in-progress.ts';
import type { WorkPeriod } from '#lib/run-records.ts';
import { workPeriodWith } from '#lib/testing/run-records.ts';
import { figure } from '#lib/testing/stats-figures.ts';
import type { PageProps } from './$types';
import StatsPage from './+page.svelte';

/** The moment the fake clock stands at, in milliseconds since 1970 (UTC). */
const START = Date.parse('2026-11-19T12:00:00Z');

// Fakes only the clock and the interval, so the page reads a moment the test controls while the
// test's own polling keeps its real timers.
beforeEach(() => {
	vi.useFakeTimers({
		toFake: ['Date', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout']
	});
	vi.setSystemTime(START);
});

afterEach(() => {
	useErrorLog(null);
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
			runningSince: new Date(START - minutes(minutesAgo)).toISOString(),
			bankedMs: 0
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

		vi.advanceTimersByTime(minutes(3));

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
					earnedMs: minutes(4),
					remainingMs: minutes(4),
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
								start: new Date(START - minutes(20)).toISOString(),
								end: new Date(START).toISOString()
							}
						],
						workedMs: minutes(20)
					})
				]
			}
		);
		await vi.advanceTimersByTimeAsync(100);

		expect(figure('All time')()).toBe('20:00');
		expect(figure('Targets reached')()).toBe('0%');
	});

	it('keeps what it shows when reading the work periods fails, and records the failure in the activity log', async () => {
		const storage = new InMemoryStorage();
		useErrorLog(storage);
		await renderStats(storage, countingSince(20));
		await expect.poll(figure('All time')).toBe('20:00');
		vi.spyOn(storage, 'getWorkPeriods').mockRejectedValue(new Error('unreadable'));

		await storage.saveRunInProgress(
			runInProgressWith({ record: startedRecord, revision: 'revision-2' }),
			'revision-1',
			{ run: null, workPeriods: [] }
		);
		await vi.advanceTimersByTimeAsync(100);

		await expect.poll(() => storage.getLogEntries()).toHaveLength(1);
		expect((await storage.getLogEntries())[0]).toMatchObject({
			type: 'error',
			message: 'Could not read the work periods for Stats.',
			details: { message: 'unreadable' }
		});
		expect(figure('All time')()).toBe('20:00');
	});
});

/**
 * Makes the run in progress of a break that follows the first work period, as another tab's Next
 * saves it.
 *
 * @param revision - The run's revision.
 * @returns The run in progress, in its break.
 */
function inBreak(revision: string): StoredRunInProgress {
	return runInProgressWith({
		record: startedRecord,
		run: {
			status: 'break',
			endedPeriods: [],
			position: { round: 0, block: 0, cycle: 0 },
			nextWorkPosition: { round: 0, block: 0, cycle: 1 },
			earnedMs: minutes(4),
			remainingMs: minutes(4),
			runningSince: new Date(START).toISOString()
		},
		revision
	});
}

/** The 20-minute work period that ends as the run moves on to its break. */
const endedPeriod = workPeriodWith({
	id: 'ended-period',
	segments: [
		{ start: new Date(START - minutes(20)).toISOString(), end: new Date(START).toISOString() }
	],
	workedMs: minutes(20)
});

describe('the Stats page when reads finish out of order or fail', () => {
	it('shows the newest read, even when an older one resolves after it', async () => {
		const storage = new InMemoryStorage();
		await renderStats(storage, countingSince(20));
		await expect.poll(figure('All time')).toBe('20:00');
		const { promise: slowOldRead, resolve: finishOldRead } = Promise.withResolvers<WorkPeriod[]>();
		vi.spyOn(storage, 'getWorkPeriods')
			.mockImplementationOnce(() => slowOldRead)
			.mockImplementationOnce(() => Promise.resolve([endedPeriod]));

		// Two changes in a row, each read again, the first read slower than the second.
		await storage.saveRunInProgress(inBreak('revision-2'), 'revision-1');
		await storage.saveRunInProgress(inBreak('revision-3'), 'revision-2');
		await vi.advanceTimersByTimeAsync(100);
		expect(figure('All time')()).toBe('20:00');
		finishOldRead([]);
		await vi.advanceTimersByTimeAsync(100);

		expect(figure('All time')()).toBe('20:00');
	});

	it('keeps the run it shows after a failed read, so the next heartbeat can’t drop the ended period’s work', async () => {
		const storage = new InMemoryStorage();
		await renderStats(storage, countingSince(20));
		await expect.poll(figure('All time')).toBe('20:00');
		vi.spyOn(storage, 'getWorkPeriods').mockRejectedValueOnce(new Error('unreadable'));

		await storage.saveRunInProgress(inBreak('revision-2'), 'revision-1', {
			run: null,
			workPeriods: [endedPeriod]
		});
		await vi.advanceTimersByTimeAsync(100);
		await storage.saveHeartbeat('revision-2', new Date(START + minutes(1)).toISOString());
		await vi.advanceTimersByTimeAsync(100);

		expect(figure('All time')()).toBe('20:00');
	});
});

describe('the Stats page following the run in progress', () => {
	it('does not read the work periods again on a heartbeat, which saves no work', async () => {
		const storage = new InMemoryStorage();
		await renderStats(storage, countingSince(20));
		await expect.poll(figure('All time')).toBe('20:00');
		const getWorkPeriods = vi.spyOn(storage, 'getWorkPeriods');

		await storage.saveHeartbeat('revision-1', new Date(START + minutes(1)).toISOString());
		await vi.advanceTimersByTimeAsync(100);

		expect(getWorkPeriods).not.toHaveBeenCalled();
	});

	it('records in the activity log that the run in progress could not be followed', async () => {
		const storage = new InMemoryStorage();
		useErrorLog(storage);
		// Through the interface, whose `watchRunInProgress` takes the `onError` that in-memory storage
		// never calls.
		vi.spyOn(storage as CadoroStorage, 'watchRunInProgress').mockImplementation(
			(_onChange, onError): (() => void) => {
				onError(new Error('unfollowable'));
				return (): void => undefined;
			}
		);

		await renderStats(storage, null);

		await expect.poll(() => storage.getLogEntries()).toHaveLength(1);
		expect((await storage.getLogEntries())[0]).toMatchObject({
			type: 'error',
			message: 'Could not read the run in progress for Stats.',
			details: { message: 'unfollowable' }
		});
	});

	it('records in the activity log that the routines could not be followed', async () => {
		const storage = new InMemoryStorage();
		useErrorLog(storage);
		// Through the interface, whose `watchRoutines` takes the `onError` that in-memory storage
		// never calls.
		vi.spyOn(storage as CadoroStorage, 'watchRoutines').mockImplementation(
			(_onChange, onError): (() => void) => {
				onError(new Error('unfollowable routines'));
				return (): void => undefined;
			}
		);

		await renderStats(storage, null);

		await expect
			.poll(() => recordedErrors(storage))
			.toEqual([['Could not read the routines for Stats.', 'unfollowable routines']]);
	});
});

describe('the Stats page when another tab imports a backup', () => {
	/**
	 * Makes a work period that ended at the fake clock's start.
	 *
	 * @param id - The work period's id.
	 * @param minutesLasted - How many minutes it lasted.
	 * @returns The work period.
	 */
	function workPeriodOfMinutes(id: string, minutesLasted: number): WorkPeriod {
		return workPeriodWith({
			id,
			runId: 'imported-run',
			routineId: oneRoundRoutine.id,
			segments: [
				{
					start: new Date(START - minutes(minutesLasted)).toISOString(),
					end: new Date(START).toISOString()
				}
			],
			workedMs: minutes(minutesLasted)
		});
	}

	/**
	 * Imports a backup holding one ten-minute work period into the storage, as another tab would.
	 *
	 * @param storage - The storage the page follows.
	 */
	async function importTenMinutes(storage: InMemoryStorage): Promise<void> {
		await storage.replaceAllData(
			{
				routines: [oneRoundRoutine],
				runs: [{ ...startedRecord, id: 'imported-run', routineId: oneRoundRoutine.id }],
				workPeriods: [workPeriodOfMinutes('imported-period', 10)],
				settings: DEFAULT_SETTINGS
			},
			{
				formatVersion: 1,
				exportedAt: new Date(START).toISOString(),
				routineCount: 1,
				runCount: 1,
				workPeriodCount: 1,
				firstRunAt: startedRecord.startedAt,
				lastRunAt: startedRecord.startedAt
			}
		);
	}

	it('shows the imported work with no run in progress, as the figures follow storage', async () => {
		const storage = new InMemoryStorage();
		await renderStats(storage, null, [workPeriodOfMinutes('old-period', 5)]);
		await expect.poll(figure('All time')).toBe('5:00');

		await importTenMinutes(storage);
		await vi.advanceTimersByTimeAsync(100);

		await expect.poll(figure('All time')).toBe('10:00');
	});

	it('records a failed read of the imported data and keeps what it shows', async () => {
		const storage = new InMemoryStorage();
		useErrorLog(storage);
		await renderStats(storage, null, [workPeriodOfMinutes('old-period', 5)]);
		vi.spyOn(storage, 'getWorkPeriods').mockRejectedValue(new Error('unreadable'));

		await importTenMinutes(storage);
		await vi.advanceTimersByTimeAsync(100);

		await expect
			.poll(async () => (await storage.getLogEntries()).map((entry) => entry.message))
			.toContain('Could not read the work periods for Stats.');
		expect(figure('All time')()).toBe('5:00');
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
		workedMs: minutes(10)
	});
}

describe('the Stats page left open past midnight', () => {
	it('shows the new day as today when local midnight passes', async () => {
		vi.setSystemTime(new Date(2026, 10, 19, 23, 59));
		await renderStats(new InMemoryStorage(), null, [lateWorkOnNov19()]);
		await expect.poll(figure('Today')).toBe('10:00');

		vi.advanceTimersByTime(minutes(2));

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
