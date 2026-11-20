// Run and work period records for tests of storage, each a whole record that a test changes only
// where it matters.

import type { Run, WorkPeriod } from '../run-records';

/** A run of the one-round routine, started at 9:00 UTC on a synthetic day and still in progress. */
export const runInProgress: Run = {
	id: 'run-1',
	routineId: 'one-round',
	startedAt: '2026-11-19T09:00:00.000Z',
	endedAt: null,
	outcome: null,
	roundsReached: 0
};

/** The first work period of {@link runInProgress}: 25 minutes from 9:00, with no pause. */
export const firstWorkPeriod: WorkPeriod = {
	id: 'period-1',
	runId: 'run-1',
	routineId: 'one-round',
	blockId: 'one-round-focus',
	targetMinutes: 25,
	segments: [{ start: '2026-11-19T09:00:00.000Z', end: '2026-11-19T09:25:00.000Z' }],
	workedMs: 1_500_000
};

/**
 * Makes a run for a test, which differs from {@link runInProgress} only where it says.
 *
 * @param changes - The fields that differ, such as `id` and `startedAt`.
 * @returns A new run with those fields changed.
 */
export function runWith(changes: Partial<Run>): Run {
	return { ...runInProgress, ...changes };
}

/** {@link runInProgress}, completed after its 25 minutes, at 9:25 UTC, with 1 round reached. */
export const completedRun: Run = runWith({
	endedAt: '2026-11-19T09:25:00.000Z',
	outcome: 'completed',
	roundsReached: 1
});

/**
 * Makes a work period for a test, which differs from {@link firstWorkPeriod} only where it says.
 *
 * @remarks
 * It copies `firstWorkPeriod` deeply, so a test that changes the new period's segments can't
 * change the shared one, which a spread alone would share.
 *
 * @param changes - The fields that differ, such as `id` and `segments`.
 * @returns A new work period with those fields changed.
 */
export function workPeriodWith(changes: Partial<WorkPeriod>): WorkPeriod {
	return { ...structuredClone(firstWorkPeriod), ...changes };
}
