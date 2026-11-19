// The daily chart's range presets, counting back from today.

import { subDays } from 'date-fns';
import { startOfLocalDay, type DaySlice } from './day-slices';
import type { DayRange } from './work-totals';

/** The ranges the daily chart offers, in the order the spec lists them. */
export const RANGE_PRESETS = ['7d', '30d', '90d', '1y', 'all'] as const;

/** One of the daily chart's range presets: 7 days, 30 days, 90 days, 1 year or all time. */
export type RangePreset = (typeof RANGE_PRESETS)[number];

/** How many days, today included, each preset before "all" covers. A year counts as 365 days. */
const DAYS_IN_PRESET: Record<Exclude<RangePreset, 'all'>, number> = {
	'7d': 7,
	'30d': 30,
	'90d': 90,
	'1y': 365
};

/**
 * Works out the days a range preset covers.
 *
 * @remarks
 * Every range ends today and counts back from it, today included, so 7 days is today and the 6
 * days before. "All" starts on the first day with work.
 *
 * @param preset - The range preset.
 * @param now - The current moment, in milliseconds since 1970 (UTC).
 * @param slices - The work, split by local day, which "all" looks through for its first day.
 * @returns The first and last day. For "all" with no work, or work only in the future, it's just
 * today.
 */
export function rangeForPreset(preset: RangePreset, now: number, slices: DaySlice[]): DayRange {
	const today = startOfLocalDay(now);
	if (preset === 'all') {
		// A reduce, since spreading a long list into `Math.min` throws a RangeError.
		const earliestWorkDay = slices.reduce(
			(earliest, slice) => Math.min(earliest, slice.dayStart),
			today
		);
		return { firstDay: earliestWorkDay, lastDay: today };
	}
	// `startOfLocalDay` again, since in a zone whose clocks change at midnight, `subDays` can land
	// on a day's missing midnight.
	const firstDay = startOfLocalDay(subDays(today, DAYS_IN_PRESET[preset] - 1).getTime());
	return { firstDay, lastDay: today };
}
