import { describe, expect, it } from 'vitest';
import type { StoredRunInProgress } from './run-in-progress';
import { oneRoundRoutine, routineWith } from './testing/routines';
import { runInProgressWith, savedRunInProgress } from './testing/run-in-progress';
import { minutes } from './testing/durations';
import { workInProgress } from './work-in-progress';

/** 09:30 UTC, 30 minutes after `savedRunInProgress`'s current stretch started. */
const NOW = Date.parse('2026-11-19T09:30:00Z');

/**
 * Makes a run in progress that's in a work period, changing only the work period's fields.
 *
 * @param working - The fields of the work period's saved state that differ.
 * @returns The run in progress.
 */
function inWorkPeriod(
	working: Partial<Extract<StoredRunInProgress['run'], { status: 'working' }>>
): StoredRunInProgress {
	return runInProgressWith({ run: { ...workingRun(), ...working } });
}

/**
 * Takes the saved run's state as a working run, which it is.
 *
 * @returns The work period's saved state.
 * @throws {@link Error} If the shared saved run in progress is no longer in a work period.
 */
function workingRun(): Extract<StoredRunInProgress['run'], { status: 'working' }> {
	const run = savedRunInProgress.run;
	if (run.status !== 'working') {
		throw new Error('The saved run in progress should be in a work period.');
	}
	return structuredClone(run);
}

describe('workInProgress', () => {
	it('is the work so far of a work period that is counting, up to now', () => {
		const period = workInProgress(savedRunInProgress, [oneRoundRoutine], NOW);

		expect(period).toMatchObject({
			routineId: 'one-round',
			blockId: 'one-round-focus',
			targetMinutes: 25,
			segments: [{ start: '2026-11-19T09:00:00.000Z', end: '2026-11-19T09:30:00.000Z' }],
			workedMs: minutes(30)
		});
	});

	it('adds the stretch that is counting to those Pause already ended', () => {
		const stored = inWorkPeriod({
			segments: [{ start: '2026-11-19T08:00:00.000Z', end: '2026-11-19T08:10:00.000Z' }]
		});

		const period = workInProgress(stored, [oneRoundRoutine], NOW);

		expect(period?.segments).toHaveLength(2);
		expect(period?.workedMs).toBe(minutes(40));
	});

	it('stops at the pause for a work period that is paused, however long ago', () => {
		const stored = inWorkPeriod({
			segments: [{ start: '2026-11-19T09:00:00.000Z', end: '2026-11-19T09:10:00.000Z' }],
			runningSince: null
		});

		const period = workInProgress(stored, [oneRoundRoutine], NOW + minutes(600));

		expect(period?.segments).toEqual([
			{ start: '2026-11-19T09:00:00.000Z', end: '2026-11-19T09:10:00.000Z' }
		]);
		expect(period?.workedMs).toBe(minutes(10));
	});

	it('is nothing when no run is saved', () => {
		expect(workInProgress(null, [oneRoundRoutine], NOW)).toBeNull();
	});

	it('is nothing on a break, since the work period before it is already saved', () => {
		const stored = runInProgressWith({
			run: {
				status: 'break',
				endedPeriods: [],
				position: { round: 0, block: 0, cycle: 0 },
				nextWorkPosition: { round: 0, block: 0, cycle: 1 },
				earnedMs: minutes(5),
				remainingMs: minutes(5),
				runningSince: '2026-11-19T09:00:00.000Z'
			}
		});

		expect(workInProgress(stored, [oneRoundRoutine], NOW)).toBeNull();
	});

	it('is nothing when the routine is not among those given', () => {
		expect(workInProgress(savedRunInProgress, [routineWith({ id: 'other' })], NOW)).toBeNull();
	});

	it('is nothing when the work has not started yet', () => {
		const stored = inWorkPeriod({ runningSince: '2026-11-19T09:30:00.000Z' });

		expect(workInProgress(stored, [oneRoundRoutine], NOW)).toBeNull();
	});
});
