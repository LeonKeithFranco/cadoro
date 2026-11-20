// Stats per routine: the routine filter and the all-time totals.

import { compareTitles, type Routine } from './routine';
import type { WorkPeriod } from './run-records';
import { totalWorkedMs } from './work-totals';

/** The total work time of one routine. */
export type RoutineTotal = {
	/** The routine's id. */
	routineId: string;
	/** The routine's title, kept after it's deleted. */
	title: string;
	/** Whether the routine has been deleted. */
	deleted: boolean;
	/** All the work done in it, in milliseconds. It's more than 0. */
	workedMs: number;
};

/** The all-time work time, overall and per routine. */
export type AllTimeTotals = {
	/** The work done in every routine together, in milliseconds. */
	workedMs: number;
	/** Each routine with work, deleted ones included, with the most worked first. */
	perRoutine: RoutineTotal[];
};

/**
 * Writes a routine's name as the stats show it.
 *
 * @param title - The routine's title.
 * @param deleted - Whether the routine has been deleted.
 * @returns The title, followed by `(deleted)` for a deleted routine.
 */
export function routineLabel(title: string, deleted: boolean): string {
	return deleted ? `${title} (deleted)` : title;
}

/**
 * Picks the work periods the stats show: every routine's, or one routine's.
 *
 * @param workPeriods - The work periods to choose from.
 * @param routineId - The routine to show, or `null` for every routine together.
 * @returns The work periods of that routine, or all of them, in their order.
 */
export function filterByRoutine(workPeriods: WorkPeriod[], routineId: string | null): WorkPeriod[] {
	if (routineId === null) {
		return workPeriods;
	}
	return workPeriods.filter((period) => period.routineId === routineId);
}

/**
 * Adds up the time worked on each routine, in one pass.
 *
 * @param workPeriods - The work periods to add up.
 * @returns The total `workedMs` of each routine's work periods, by routine id. Routines with no
 * work have no entry.
 */
export function workedMsByRoutine(workPeriods: WorkPeriod[]): Map<string, number> {
	const totals = new Map<string, number>();
	for (const period of workPeriods) {
		totals.set(period.routineId, (totals.get(period.routineId) ?? 0) + period.workedMs);
	}
	return totals;
}

/**
 * Adds up all the work time, overall and per routine.
 *
 * @remarks
 * Deleted routines are kept in storage, hidden, so their work still counts and shows under their
 * title. A routine with no work isn't listed. Routines whose work is tied by time are listed by
 * title.
 *
 * @param workPeriods - The work periods to add up.
 * @param routines - Every routine, deleted ones included.
 * @returns The overall total and a total for each routine with work. The overall total includes
 * work by a routine that isn't in `routines`, which has no total of its own, since it has no
 * title to show it under.
 */
export function allTimeTotals(workPeriods: WorkPeriod[], routines: Routine[]): AllTimeTotals {
	const workedMs = totalWorkedMs(workPeriods);
	const workedByRoutine = workedMsByRoutine(workPeriods);
	const perRoutine = routines
		.map((routine) => ({
			routineId: routine.id,
			title: routine.title,
			deleted: routine.deletedAt !== null,
			workedMs: workedByRoutine.get(routine.id) ?? 0
		}))
		.filter((total) => total.workedMs > 0)
		.sort(
			(first, second) =>
				second.workedMs - first.workedMs || compareTitles(first.title, second.title)
		);
	return { workedMs, perRoutine };
}
