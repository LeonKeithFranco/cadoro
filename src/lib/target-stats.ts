// How the work compares with its targets: time against target and targets reached.

import { asPercentOf } from './percent';
import type { WorkPeriod } from './run-records';
import { minutesToMs } from './time';

/**
 * Works out the total time worked as a percentage of the total of the periods' targets.
 *
 * @remarks
 * It adds up the time and the targets before dividing, rather than averaging each period's
 * percentage, so each period counts in proportion to its target, as the spec asks.
 *
 * @param workPeriods - The work periods to compare.
 * @returns The percentage, such as 112 for 112%, or `null` when there are no work periods, since
 * nothing can be a percentage of no target.
 */
export function timeAgainstTarget(workPeriods: WorkPeriod[]): number | null {
	const totalWorkedMs = workPeriods.reduce((total, period) => total + period.workedMs, 0);
	const totalTargetMs = workPeriods.reduce(
		(total, period) => total + minutesToMs(period.targetMinutes),
		0
	);
	if (totalTargetMs === 0) {
		return null;
	}
	return asPercentOf(totalWorkedMs, totalTargetMs);
}

/**
 * Works out the share of work periods that reached their target.
 *
 * @remarks
 * A period reached its target when it worked at least the target, so working exactly the target
 * counts.
 *
 * @param workPeriods - The work periods to count.
 * @returns The percentage that reached their target, such as 50, or `null` when there are no work
 * periods.
 */
export function targetsReached(workPeriods: WorkPeriod[]): number | null {
	if (workPeriods.length === 0) {
		return null;
	}
	const reachedCount = workPeriods.filter(
		(period) => period.workedMs >= minutesToMs(period.targetMinutes)
	).length;
	return asPercentOf(reachedCount, workPeriods.length);
}
