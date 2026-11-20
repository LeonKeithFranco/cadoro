// What the Stats screen shows, worked out from the saved work periods and routines: every number
// is calculated by the stats modules, and this only picks them and writes them as text.

import { format } from 'date-fns';
import { daySlicesOf, localDayText } from './day-slices';
import { counted } from './plural';
import { allTimeTotals, filterByRoutine, routineLabel } from './routine-stats';
import type { Routine } from './routine';
import type { WorkPeriod } from './run-records';
import { rangeForPreset, type RangePreset } from './stats-range';
import { streaksOf } from './streaks';
import { targetsReached, timeAgainstTarget } from './target-stats';
import { formatElapsed, minutesToMs } from './time';
import {
	dailyTotals,
	monthlyTotals,
	weeklyTotals,
	workedToday,
	type WorkTotal
} from './work-totals';

/** The milliseconds in one minute, the unit the daily chart's bars are drawn in. */
const MS_PER_MINUTE = minutesToMs(1);

/** What the Stats screen is asked to show. */
export type StatsInput = {
	/** Every saved work period. */
	workPeriods: WorkPeriod[];
	/** The routines that can be named, which the routine filter offers. */
	routines: Routine[];
	/** The routine to show, or `null` for every routine together. */
	routineId: string | null;
	/** The daily chart's range. */
	preset: RangePreset;
	/** The current moment, in milliseconds since 1970 (UTC). */
	now: number;
	/**
	 * The work so far in the run in progress's work period, as `workInProgress` works it out, or
	 * `null` or left out when there is none. It counts in work time and streaks but not in the
	 * target figures, since it hasn't ended.
	 */
	workInProgress?: WorkPeriod | null;
};

/** A row of a list of totals: one week, month or routine. */
export type TotalRow = {
	/** A key no other row of the list has. */
	key: string;
	/** What the row is for, such as `Week of Nov 16` or a routine's title. */
	label: string;
	/** The work time, as text such as `1:05:00`. */
	duration: string;
};

/** One bar of the daily chart. */
export type DayBar = {
	/** The local day as `yyyy-MM-dd`, which no other bar has. */
	day: string;
	/** The day as shown on the chart's axis, such as `Nov 19`. */
	label: string;
	/** The day with its year, such as `Nov 19, 2026`, for the table, where a long range repeats days. */
	dateLabel: string;
	/** The work time, in minutes at full precision, as the bar's height. */
	minutes: number;
	/** The work time as text such as `25:00`, for the table that describes the chart. */
	duration: string;
};

/** Everything the Stats screen shows, as text and rows ready to display. */
export type StatsView = {
	/** Whether any work is saved at all, whatever the routine filter says. */
	hasWork: boolean;
	/** The work time today, such as `25:00`. */
	today: string;
	/** The current streak, such as `3 days`. */
	currentStreak: string;
	/** The longest streak, such as `1 day`. */
	longestStreak: string;
	/** Time against target, such as `112%`, or `-` when there is no work period. */
	timeAgainstTarget: string;
	/** The share of work periods that reached their target, such as `50%`, or `-` when there is none. */
	targetsReached: string;
	/** The daily chart's bars over the chosen range, oldest first, a bar for every day. */
	days: DayBar[];
	/** The weeks with work, newest first. */
	weeks: TotalRow[];
	/** The months with work, newest first. */
	months: TotalRow[];
	/** All the work ever, as text. */
	allTime: string;
	/** Each routine's all-time work, most worked first, deleted routines included. */
	routineTotals: TotalRow[];
};

/**
 * Works out everything the Stats screen shows.
 *
 * @remarks
 * The routine filter narrows every figure, `hasWork` excepted, which says whether to show the
 * empty state at all.
 *
 * @param input - The work periods, routines, filter, range and current moment.
 * @returns The screen's text and rows.
 */
export function viewStats(input: StatsInput): StatsView {
	const { now } = input;
	const everyWork = [...input.workPeriods, ...(input.workInProgress ? [input.workInProgress] : [])];
	const allSlices = daySlicesOf(everyWork);
	const workPeriods = filterByRoutine(input.workPeriods, input.routineId);
	const routineWork = filterByRoutine(everyWork, input.routineId);
	const slices = daySlicesOf(routineWork);
	const range = rangeForPreset(input.preset, now, slices);
	const streaks = streaksOf(slices, now);
	const allTime = allTimeTotals(routineWork, input.routines);

	return {
		hasWork: allSlices.length > 0,
		today: formatElapsed(workedToday(slices, now)),
		currentStreak: formatDays(streaks.current),
		longestStreak: formatDays(streaks.longest),
		timeAgainstTarget: formatPercent(timeAgainstTarget(workPeriods)),
		targetsReached: formatPercent(targetsReached(workPeriods)),
		days: dailyTotals(slices, range).map((total) => ({
			day: localDayText(total.start),
			label: format(total.start, 'MMM d'),
			dateLabel: format(total.start, 'MMM d, yyyy'),
			minutes: total.workedMs / MS_PER_MINUTE,
			duration: formatElapsed(total.workedMs)
		})),
		weeks: newestFirst(weeklyTotals(slices)).map((total) =>
			totalRow(total, "'Week of' MMM d, yyyy")
		),
		months: newestFirst(monthlyTotals(slices)).map((total) => totalRow(total, 'MMMM yyyy')),
		allTime: formatElapsed(allTime.workedMs),
		routineTotals: allTime.perRoutine.map((total) => ({
			key: total.routineId,
			label: routineLabel(total.title, total.deleted),
			duration: formatElapsed(total.workedMs)
		}))
	};
}

/**
 * Reverses a list of totals, which the stats modules give oldest first, so the latest comes first.
 *
 * @param totals - The totals, oldest first.
 * @returns A new list, newest first.
 */
function newestFirst(totals: WorkTotal[]): WorkTotal[] {
	return [...totals].reverse();
}

/**
 * Makes a row for a week or month.
 *
 * @param total - The week's or month's total.
 * @param labelFormat - A date-fns format for its label, such as `MMMM yyyy`.
 * @returns The row, whose key is its start moment.
 */
function totalRow(total: WorkTotal, labelFormat: string): TotalRow {
	return {
		key: String(total.start),
		label: format(total.start, labelFormat),
		duration: formatElapsed(total.workedMs)
	};
}

/**
 * Writes a number of days, such as `1 day` or `3 days`.
 *
 * @param count - The number of days.
 * @returns The count with its unit in the singular for 1.
 */
function formatDays(count: number): string {
	return counted(count, 'day');
}

/**
 * Writes a percentage rounded to a whole number, such as `112%`.
 *
 * @param percent - The percentage, or `null` when there is nothing to take it of.
 * @returns The percentage as text, or `-` for `null`.
 */
function formatPercent(percent: number | null): string {
	return percent === null ? '-' : `${Math.round(percent)}%`;
}
