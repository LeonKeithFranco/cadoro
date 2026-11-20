// Splits work at local midnight, so each day's work time can be added up. This is the only place
// that works out local days: moments are stored in UTC, and the time zone matters only for stats.

import { addDays, format, startOfDay } from 'date-fns';
import { fromUtcTimestamp } from './time';
import type { WorkPeriod } from './run-records';

/** The part of a work period's work that fell on one local day. */
export type DaySlice = {
	/** The start of the local day, as the moment of its midnight in milliseconds since 1970 (UTC). */
	dayStart: number;
	/** The work done on that day, in milliseconds. It's more than 0. */
	workedMs: number;
};

/**
 * Finds the local day a moment falls on.
 *
 * @param moment - A moment, in milliseconds since 1970 (UTC).
 * @returns The moment of that day's local midnight, in milliseconds since 1970 (UTC).
 */
export function startOfLocalDay(moment: number): number {
	return startOfDay(moment).getTime();
}

/**
 * Writes the local day a moment falls on as text.
 *
 * @param moment - A moment, in milliseconds since 1970 (UTC).
 * @returns The day in the user's time zone, such as `2026-11-19`.
 */
export function localDayText(moment: number): string {
	return format(moment, 'yyyy-MM-dd');
}

/**
 * Finds the local day after another.
 *
 * @remarks
 * It keeps the wall-clock time of midnight, so a day with a daylight saving change is 23 or 25
 * hours long, not 24. In a zone whose clocks change at midnight, the change day has no midnight and
 * starts at 01:00, so the next day's start is taken again from its date, rather than keeping 01:00.
 *
 * @param dayStart - The local midnight that starts a day, in milliseconds since 1970 (UTC).
 * @returns The local midnight that starts the next day.
 */
export function nextLocalDay(dayStart: number): number {
	return startOfDay(addDays(dayStart, 1)).getTime();
}

/**
 * Splits one unpaused stretch of work at each local midnight it crosses.
 *
 * @param start - When the stretch started, in milliseconds since 1970 (UTC).
 * @param end - When it ended, in the same unit.
 * @returns One slice for each local day the stretch touches, oldest first. A stretch that is empty
 * or ends before it starts gives none.
 */
export function splitAtMidnight(start: number, end: number): DaySlice[] {
	const slices: DaySlice[] = [];
	let cursor = start;
	while (cursor < end) {
		const dayStart = startOfLocalDay(cursor);
		const sliceEnd = Math.min(end, nextLocalDay(dayStart));
		slices.push({ dayStart, workedMs: sliceEnd - cursor });
		cursor = sliceEnd;
	}
	return slices;
}

/**
 * Splits every work period's unpaused segments at local midnight.
 *
 * @remarks
 * It uses the segments rather than each period's start and end, so paused time never counts, as
 * the spec asks.
 *
 * @param workPeriods - The work periods to split, in any order.
 * @returns The slices of all their segments, one per segment and local day, in the periods' order.
 */
export function daySlicesOf(workPeriods: WorkPeriod[]): DaySlice[] {
	return workPeriods.flatMap((period) =>
		period.segments.flatMap((segment) =>
			splitAtMidnight(fromUtcTimestamp(segment.start), fromUtcTimestamp(segment.end))
		)
	);
}
