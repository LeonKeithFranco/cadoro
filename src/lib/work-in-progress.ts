// The work period that's still going, which isn't a saved work period until Next or Finish ends it,
// but which Stats counts as work already done.

import { blockAt, currentPeriodUpTo } from './run';
import { followRunInProgress, type StoredRunInProgress } from './run-in-progress';
import { storedSegment, type WorkPeriod } from './run-records';
import type { Routine } from './routine';

/** The id of the work period in progress, which no saved work period has, since saved ones are UUIDs. */
const WORK_IN_PROGRESS_ID = 'work-in-progress';

/**
 * Works out the work so far in the work period of the run in progress.
 *
 * @remarks
 * Stats counts it in the work time, up to the moment the run was paused or, while it counts, up
 * to now. It has no end yet, so it isn't a saved work period and the target figures leave it out.
 * A run on a break has no work period in progress, since the one before it is saved already.
 *
 * @param runInProgress - The run in progress as storage keeps it, or `null` when none is saved.
 * @param routines - Every routine, deleted ones included, for the work period's block and target.
 * @param now - The current moment, in milliseconds since 1970 (UTC).
 * @returns The work period so far, or `null` when there isn't one, or no time has been worked in
 * it yet, or its routine isn't among `routines`.
 */
export function workInProgress(
	runInProgress: StoredRunInProgress | null,
	routines: Routine[],
	now: number
): WorkPeriod | null {
	if (runInProgress === null) {
		return null;
	}
	const followed = followRunInProgress(runInProgress, routines);
	if (followed?.run.status !== 'working') {
		return null;
	}

	const { routine, record, run } = followed;
	const period = currentPeriodUpTo(run, now);
	if (period.workedMs === 0) {
		return null;
	}

	const block = blockAt(routine, run.position);
	return {
		id: WORK_IN_PROGRESS_ID,
		runId: record.id,
		routineId: record.routineId,
		blockId: block.id,
		targetMinutes: period.targetMinutes,
		segments: period.segments.map(storedSegment),
		workedMs: period.workedMs
	};
}
