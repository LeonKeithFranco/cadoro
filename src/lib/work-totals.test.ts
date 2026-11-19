import './testing/time-zone';
import { describe, expect, it } from 'vitest';
import type { DaySlice } from './day-slices';
import { hours, minutes } from './testing/durations';
import { dailyTotals, monthlyTotals, weeklyTotals, workedToday } from './work-totals';

/**
 * Reads a UTC timestamp as milliseconds, so each test writes its moments as readable literals.
 *
 * @param timestamp - A UTC timestamp, such as `2026-11-20T05:00:00Z`.
 * @returns The moment in milliseconds since 1970 (UTC).
 */
function utc(timestamp: string): number {
	return Date.parse(timestamp);
}

/**
 * Makes a slice of work for a test.
 *
 * @param dayStart - The UTC timestamp of the day's local midnight.
 * @param workedMs - The work done that day, in milliseconds.
 * @returns The slice.
 */
function slice(dayStart: string, workedMs: number): DaySlice {
	return { dayStart: utc(dayStart), workedMs };
}

describe('dailyTotals', () => {
	const range = { firstDay: utc('2026-11-18T05:00:00Z'), lastDay: utc('2026-11-20T05:00:00Z') };

	it('adds up each day and gives 0 for a day without work', () => {
		const slices = [
			slice('2026-11-18T05:00:00Z', minutes(25)),
			slice('2026-11-18T05:00:00Z', minutes(5)),
			slice('2026-11-20T05:00:00Z', minutes(10))
		];

		expect(dailyTotals(slices, range)).toEqual([
			{ start: utc('2026-11-18T05:00:00Z'), workedMs: minutes(30) },
			{ start: utc('2026-11-19T05:00:00Z'), workedMs: 0 },
			{ start: utc('2026-11-20T05:00:00Z'), workedMs: minutes(10) }
		]);
	});

	it('ignores work outside the range', () => {
		const slices = [
			slice('2026-11-17T05:00:00Z', minutes(25)),
			slice('2026-11-21T05:00:00Z', minutes(25))
		];

		expect(dailyTotals(slices, range).map((total) => total.workedMs)).toEqual([0, 0, 0]);
	});

	it('gives every day of the range when there is no work', () => {
		expect(dailyTotals([], range)).toHaveLength(3);
	});

	it('steps over a 23-hour day without skipping or repeating a day', () => {
		const days = dailyTotals([], {
			firstDay: utc('2026-03-07T05:00:00Z'),
			lastDay: utc('2026-03-09T04:00:00Z')
		});

		expect(days.map((total) => total.start)).toEqual([
			utc('2026-03-07T05:00:00Z'),
			utc('2026-03-08T05:00:00Z'),
			utc('2026-03-09T04:00:00Z')
		]);
	});

	it('gives one day when the first and last days are the same', () => {
		const day = utc('2026-11-19T05:00:00Z');

		expect(dailyTotals([], { firstDay: day, lastDay: day })).toHaveLength(1);
	});

	it('gives nothing when the last day is before the first', () => {
		expect(dailyTotals([], { firstDay: range.lastDay, lastDay: range.firstDay })).toEqual([]);
	});
});

describe('weeklyTotals', () => {
	it('gives nothing when there is no work', () => {
		expect(weeklyTotals([])).toEqual([]);
	});

	it('starts each week on Monday, so Sunday ends the week before', () => {
		// Nov 15 2026 is a Sunday, Nov 16 a Monday and Nov 22 the next Sunday.
		const slices = [
			slice('2026-11-15T05:00:00Z', hours(1)),
			slice('2026-11-16T05:00:00Z', hours(2)),
			slice('2026-11-22T05:00:00Z', hours(4)),
			slice('2026-11-23T05:00:00Z', hours(8))
		];

		expect(weeklyTotals(slices)).toEqual([
			{ start: utc('2026-11-09T05:00:00Z'), workedMs: hours(1) },
			{ start: utc('2026-11-16T05:00:00Z'), workedMs: hours(6) },
			{ start: utc('2026-11-23T05:00:00Z'), workedMs: hours(8) }
		]);
	});

	it('keys a week that holds a daylight saving change by its Monday midnight', () => {
		// Sunday Mar 8 2026 is the day the clocks go forward, in the week that starts on Mon Mar 2.
		const slices = [
			slice('2026-03-02T05:00:00Z', hours(1)),
			slice('2026-03-08T05:00:00Z', hours(1)),
			slice('2026-03-09T04:00:00Z', hours(1))
		];

		expect(weeklyTotals(slices)).toEqual([
			{ start: utc('2026-03-02T05:00:00Z'), workedMs: hours(2) },
			{ start: utc('2026-03-09T04:00:00Z'), workedMs: hours(1) }
		]);
	});

	it('sorts weeks oldest first whatever order the work is in', () => {
		const slices = [
			slice('2026-11-23T05:00:00Z', hours(1)),
			slice('2026-11-09T05:00:00Z', hours(1))
		];

		expect(weeklyTotals(slices).map((total) => total.start)).toEqual([
			utc('2026-11-09T05:00:00Z'),
			utc('2026-11-23T05:00:00Z')
		]);
	});
});

describe('monthlyTotals', () => {
	it('gives nothing when there is no work', () => {
		expect(monthlyTotals([])).toEqual([]);
	});

	it('adds up each calendar month, whose first day is its local midnight', () => {
		const slices = [
			slice('2026-10-31T04:00:00Z', hours(1)),
			slice('2026-11-01T04:00:00Z', hours(2)),
			slice('2026-11-30T05:00:00Z', hours(4)),
			slice('2026-12-01T05:00:00Z', hours(8))
		];

		expect(monthlyTotals(slices)).toEqual([
			{ start: utc('2026-10-01T04:00:00Z'), workedMs: hours(1) },
			{ start: utc('2026-11-01T04:00:00Z'), workedMs: hours(6) },
			{ start: utc('2026-12-01T05:00:00Z'), workedMs: hours(8) }
		]);
	});

	it('skips months without work', () => {
		const slices = [
			slice('2026-01-05T05:00:00Z', hours(1)),
			slice('2026-03-05T05:00:00Z', hours(1))
		];

		expect(monthlyTotals(slices)).toHaveLength(2);
	});
});

describe('workedToday', () => {
	const slices = [
		slice('2026-11-18T05:00:00Z', hours(1)),
		slice('2026-11-19T05:00:00Z', minutes(25)),
		slice('2026-11-19T05:00:00Z', minutes(5)),
		slice('2026-11-20T05:00:00Z', hours(2))
	];

	it('adds up only the work on the local day of the moment', () => {
		expect(workedToday(slices, utc('2026-11-19T15:00:00Z'))).toBe(minutes(30));
	});

	it('uses the local day, which is still the 19th at 04:30 UTC on the 20th', () => {
		expect(workedToday(slices, utc('2026-11-20T04:30:00Z'))).toBe(minutes(30));
	});

	it('gives 0 when there is no work today', () => {
		expect(workedToday(slices, utc('2026-11-25T15:00:00Z'))).toBe(0);
	});
});
