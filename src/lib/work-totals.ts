// Totals of work time per local day, week and month, worked out from the day slices.

import { startOfMonth, startOfWeek } from 'date-fns';
import { nextLocalDay, startOfLocalDay, type DaySlice } from './day-slices';

/** The weekday a week starts on: Monday, which date-fns counts as 1 (Sunday is 0). */
const MONDAY = 1;

/** The work done in one local day, week or month. */
export type WorkTotal = {
	/** The start of the day, week or month, as its local midnight in milliseconds since 1970 (UTC). */
	start: number;
	/** The work done in it, in milliseconds. */
	workedMs: number;
};

/** A stretch of local days, both ends included. */
export type DayRange = {
	/** The local midnight that starts the first day, in milliseconds since 1970 (UTC). */
	firstDay: number;
	/** The local midnight that starts the last day, in the same unit. */
	lastDay: number;
};

/**
 * Adds up the work time of work periods, day slices or anything else that records it.
 *
 * @param items - The items to add up, each with the work it holds in milliseconds.
 * @returns The total in milliseconds, or 0 for no items.
 */
export function totalWorkedMs(items: { workedMs: number }[]): number {
	return items.reduce((total, item) => total + item.workedMs, 0);
}

/**
 * Adds up work time by the bucket each day falls in.
 *
 * @param slices - The work, split by local day.
 * @param bucketStart - Maps a day's start to the start of its bucket, such as its week's Monday.
 * @returns One total per bucket that holds work, oldest first.
 */
function totalsByBucket(
	slices: DaySlice[],
	bucketStart: (dayStart: number) => number
): WorkTotal[] {
	const workedByBucket = new Map<number, number>();
	for (const slice of slices) {
		const start = bucketStart(slice.dayStart);
		workedByBucket.set(start, (workedByBucket.get(start) ?? 0) + slice.workedMs);
	}
	return [...workedByBucket]
		.map(([start, workedMs]) => ({ start, workedMs }))
		.sort((first, second) => first.start - second.start);
}

/**
 * Adds up the work done on each day of a range.
 *
 * @param slices - The work, split by local day. Work outside the range is ignored.
 * @param range - The days to total.
 * @returns One total for every day in the range, oldest first, with 0 for a day without work. It's
 * empty when the range's last day is before its first.
 */
export function dailyTotals(slices: DaySlice[], range: DayRange): WorkTotal[] {
	const workedByDay = new Map(
		totalsByBucket(slices, (dayStart) => dayStart).map((total) => [total.start, total.workedMs])
	);
	const totals: WorkTotal[] = [];
	for (let day = range.firstDay; day <= range.lastDay; day = nextLocalDay(day)) {
		totals.push({ start: day, workedMs: workedByDay.get(day) ?? 0 });
	}
	return totals;
}

/**
 * Adds up work time per week, with weeks starting on Monday.
 *
 * @param slices - The work, split by local day.
 * @returns One total for each week that holds work, oldest first, keyed by the Monday's midnight.
 */
export function weeklyTotals(slices: DaySlice[]): WorkTotal[] {
	return totalsByBucket(slices, (dayStart) =>
		startOfWeek(dayStart, { weekStartsOn: MONDAY }).getTime()
	);
}

/**
 * Adds up work time per calendar month.
 *
 * @param slices - The work, split by local day.
 * @returns One total for each month that holds work, oldest first, keyed by the first day's midnight.
 */
export function monthlyTotals(slices: DaySlice[]): WorkTotal[] {
	return totalsByBucket(slices, (dayStart) => startOfMonth(dayStart).getTime());
}

/**
 * Adds up the work done today.
 *
 * @param slices - The work, split by local day.
 * @param now - The current moment, in milliseconds since 1970 (UTC).
 * @returns Today's work time in milliseconds, or 0 when there is none.
 */
export function workedToday(slices: DaySlice[], now: number): number {
	const today = startOfLocalDay(now);
	return totalWorkedMs(slices.filter((slice) => slice.dayStart === today));
}
