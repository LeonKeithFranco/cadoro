// Streaks: days in a row with any work.

import { nextLocalDay, startOfLocalDay, type DaySlice } from './day-slices';

/** The current and longest streaks, in days. */
export type Streaks = {
	/** Days in a row with work, ending today or, when today has none yet, yesterday. 0 when neither has work. */
	current: number;
	/** The most days in a row with work anywhere in the history, which is never less than `current`. */
	longest: number;
};

/**
 * Works out the current and longest streaks.
 *
 * @remarks
 * Days are local days. The current streak stays alive through today until midnight, as the spec
 * asks, so it doesn't drop to 0 just because there's no work yet today: with work on the last
 * three days and none yet today, it's 3. Work later than today is ignored for the current streak,
 * but counts for the longest.
 *
 * @param slices - The work, split by local day.
 * @param now - The current moment, in milliseconds since 1970 (UTC).
 * @returns The two streaks, both 0 when there is no work.
 */
export function streaksOf(slices: DaySlice[], now: number): Streaks {
	const workDays = [...new Set(slices.map((slice) => slice.dayStart))].sort(
		(first, second) => first - second
	);
	const workDaySet = new Set(workDays);

	let longest = 0;
	let runLength = 0;
	let previousDay: number | null = null;
	for (const day of workDays) {
		const continuesRun = previousDay !== null && nextLocalDay(previousDay) === day;
		runLength = continuesRun ? runLength + 1 : 1;
		longest = Math.max(longest, runLength);
		previousDay = day;
	}

	const today = startOfLocalDay(now);
	const lastDayOfCurrent = workDaySet.has(today) ? today : previousLocalDay(today);
	let current = 0;
	for (let day = lastDayOfCurrent; workDaySet.has(day); day = previousLocalDay(day)) {
		current += 1;
	}

	return { current, longest };
}

/**
 * Finds the local day before another.
 *
 * @param dayStart - The local midnight that starts a day, in milliseconds since 1970 (UTC).
 * @returns The local midnight that starts the day before.
 */
function previousLocalDay(dayStart: number): number {
	return startOfLocalDay(dayStart - 1);
}
