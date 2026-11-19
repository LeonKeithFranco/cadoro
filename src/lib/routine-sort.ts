// The seven orders the Routines screen and the Timer's picker can list routines in.

import type { Routine } from './routine';
import type { Run, WorkPeriod } from './run-records';

/** How routines are ordered: the spec's `RoutineSort`. */
export type RoutineSort =
	'custom' | 'title-asc' | 'title-desc' | 'last-used' | 'most-work' | 'newest' | 'oldest';

/** The records that "last used" and "most work" are worked out from. */
export type RoutineUsage = {
	/** Every run saved, of any routine. */
	runs: Run[];
	/** Every work period saved, of any routine. */
	workPeriods: WorkPeriod[];
};

/**
 * Compares two texts for ordering, ignoring case and accents so "apple" sits with "Apple".
 *
 * @param a - The first text.
 * @param b - The second text.
 * @returns Negative when `a` comes first, positive when `b` does, 0 when they match.
 */
function compareText(a: string, b: string): number {
	return a.localeCompare(b, 'en', { sensitivity: 'base' });
}

/**
 * Compares two UTC timestamps in the same format, which order the same as the moments they name.
 *
 * @param a - The first timestamp.
 * @param b - The second timestamp.
 * @returns Negative when `a` is earlier, positive when `b` is, 0 when they match.
 */
function compareTimestamps(a: string, b: string): number {
	if (a < b) return -1;
	if (a > b) return 1;
	return 0;
}

/**
 * Finds when each routine was last run.
 *
 * @param runs - Every run saved.
 * @returns The start of each routine's latest run, by routine id. Routines never run have no entry.
 */
function lastRunStartByRoutine(runs: Run[]): Map<string, string> {
	const latest = new Map<string, string>();
	for (const run of runs) {
		const known = latest.get(run.routineId);
		if (known === undefined || run.startedAt > known) {
			latest.set(run.routineId, run.startedAt);
		}
	}
	return latest;
}

/**
 * Adds up the time worked on each routine.
 *
 * @param workPeriods - Every work period saved.
 * @returns The total `workedMs` of each routine's work periods, by routine id. Routines with no
 * work have no entry.
 */
function workedMsByRoutine(workPeriods: WorkPeriod[]): Map<string, number> {
	const totals = new Map<string, number>();
	for (const period of workPeriods) {
		totals.set(period.routineId, (totals.get(period.routineId) ?? 0) + period.workedMs);
	}
	return totals;
}

/**
 * Compares two routines by their place in the custom order.
 *
 * @param a - The first routine.
 * @param b - The second routine.
 * @returns Negative when `a` comes first, positive when `b` does.
 */
function compareCustom(a: Routine, b: Routine): number {
	return a.customPosition - b.customPosition;
}

/**
 * Makes the comparison for a sort order, before the custom order breaks its ties.
 *
 * @param sort - The order to compare by.
 * @param usage - The runs and work periods, for the usage orders.
 * @returns A comparison of two routines for that order. It returns 0 for routines the order
 * can't tell apart.
 */
function comparisonFor(sort: RoutineSort, usage: RoutineUsage): (a: Routine, b: Routine) => number {
	switch (sort) {
		case 'custom':
			return compareCustom;
		case 'title-asc':
			return (a, b) => compareText(a.title, b.title);
		case 'title-desc':
			return (a, b) => compareText(b.title, a.title);
		case 'newest':
			return (a, b) => compareTimestamps(b.createdAt, a.createdAt);
		case 'oldest':
			return (a, b) => compareTimestamps(a.createdAt, b.createdAt);
		case 'last-used': {
			const lastStarts = lastRunStartByRoutine(usage.runs);
			return (a, b) => {
				const lastStartA = lastStarts.get(a.id);
				const lastStartB = lastStarts.get(b.id);
				if (lastStartA === undefined && lastStartB === undefined) return 0;
				if (lastStartA === undefined) return 1;
				if (lastStartB === undefined) return -1;
				return compareTimestamps(lastStartB, lastStartA);
			};
		}
		case 'most-work': {
			const totals = workedMsByRoutine(usage.workPeriods);
			return (a, b) => (totals.get(b.id) ?? 0) - (totals.get(a.id) ?? 0);
		}
	}
}

/**
 * Puts routines in a sort order.
 *
 * @remarks
 * Routines the order can't tell apart, such as two with the same title, or two never used, keep
 * their custom order. "Last used" is the start of a routine's latest run, most recent first,
 * with routines never run last. "Most work" is the total `workedMs` of a routine's work periods,
 * most first, so a routine with none counts as 0. A deleted routine is sorted like any other, so
 * the caller leaves those out first.
 *
 * @param routines - The routines to order, in any order.
 * @param sort - The order to put them in.
 * @param usage - The runs and work periods, which only "last used" and "most work" read.
 * @returns A new list of the routines in that order.
 */
export function sortRoutines(
	routines: Routine[],
	sort: RoutineSort,
	usage: RoutineUsage
): Routine[] {
	const compare = comparisonFor(sort, usage);
	return routines.toSorted((a, b) => compare(a, b) || compareCustom(a, b));
}
