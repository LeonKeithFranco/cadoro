// The run in progress as storage keeps it, for tests of storage: one whole row that a test
// changes only where it matters.

import type { StoredRunInProgress } from '../run-in-progress';
import { runInProgress } from './run-records';

/**
 * {@link runInProgress}, ten minutes into its first work period and still running, as saved by
 * the heartbeat at 9:10 UTC.
 */
export const savedRunInProgress: StoredRunInProgress = {
	record: runInProgress,
	run: {
		status: 'working',
		endedPeriods: [],
		position: { round: 0, block: 0, cycle: 0 },
		segments: [],
		runningSince: '2026-11-19T09:00:00.000Z'
	},
	heartbeatAt: '2026-11-19T09:10:00.000Z'
};

/**
 * Makes a run in progress for a test, which differs from {@link savedRunInProgress} only where
 * it says.
 *
 * @remarks
 * It copies `savedRunInProgress` deeply, so a test that changes the new row's run can't change
 * the shared one, which a spread alone would share.
 *
 * @param changes - The fields that differ, such as `heartbeatAt`.
 * @returns A new run in progress with those fields changed.
 */
export function runInProgressWith(changes: Partial<StoredRunInProgress>): StoredRunInProgress {
	return { ...structuredClone(savedRunInProgress), ...changes };
}
