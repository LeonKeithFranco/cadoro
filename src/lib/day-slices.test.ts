import { TEST_TIME_ZONE } from './testing/time-zone';
import { describe, expect, it } from 'vitest';
import { daySlicesOf, nextLocalDay, splitAtMidnight, startOfLocalDay } from './day-slices';
import { hours, minutes } from './testing/durations';
import { workPeriodWith } from './testing/run-records';

/**
 * Reads a UTC timestamp as milliseconds, so each test writes its moments as readable literals.
 *
 * @param timestamp - A UTC timestamp, such as `2026-11-20T05:00:00Z`.
 * @returns The moment in milliseconds since 1970 (UTC).
 */
function utc(timestamp: string): number {
	return Date.parse(timestamp);
}

describe('the test time zone', () => {
	it('is New York, where midnight is 05:00 UTC in winter and 04:00 UTC in summer', () => {
		expect(TEST_TIME_ZONE).toBe('America/New_York');
		expect(startOfLocalDay(utc('2026-11-19T12:00:00Z'))).toBe(utc('2026-11-19T05:00:00Z'));
		expect(startOfLocalDay(utc('2026-07-15T12:00:00Z'))).toBe(utc('2026-07-15T04:00:00Z'));
	});
});

describe('startOfLocalDay', () => {
	it('gives the local midnight, even when the UTC date is already the next day', () => {
		// 23:30 on Nov 19 in New York is 04:30 UTC on Nov 20.
		expect(startOfLocalDay(utc('2026-11-20T04:30:00Z'))).toBe(utc('2026-11-19T05:00:00Z'));
	});
});

describe('nextLocalDay', () => {
	it('adds 24 hours on an ordinary day', () => {
		expect(nextLocalDay(utc('2026-11-19T05:00:00Z'))).toBe(utc('2026-11-20T05:00:00Z'));
	});

	it('adds 23 hours on the day the clocks go forward', () => {
		expect(nextLocalDay(utc('2026-03-08T05:00:00Z'))).toBe(utc('2026-03-09T04:00:00Z'));
	});

	it('adds 25 hours on the day the clocks go back', () => {
		expect(nextLocalDay(utc('2026-11-01T04:00:00Z'))).toBe(utc('2026-11-02T05:00:00Z'));
	});
});

describe('splitAtMidnight', () => {
	it('keeps a stretch within one day as one slice', () => {
		expect(splitAtMidnight(utc('2026-11-19T14:00:00Z'), utc('2026-11-19T14:25:00Z'))).toEqual([
			{ dayStart: utc('2026-11-19T05:00:00Z'), workedMs: minutes(25) }
		]);
	});

	it('splits a stretch across local midnight, not UTC midnight', () => {
		// 23:50 to 00:20 in New York: 10 minutes on Nov 19 and 20 on Nov 20.
		expect(splitAtMidnight(utc('2026-11-20T04:50:00Z'), utc('2026-11-20T05:20:00Z'))).toEqual([
			{ dayStart: utc('2026-11-19T05:00:00Z'), workedMs: minutes(10) },
			{ dayStart: utc('2026-11-20T05:00:00Z'), workedMs: minutes(20) }
		]);
	});

	it('does not split a stretch that crosses UTC midnight but not local midnight', () => {
		// 18:50 to 19:20 in New York is 23:50 to 00:20 UTC.
		expect(splitAtMidnight(utc('2026-11-19T23:50:00Z'), utc('2026-11-20T00:20:00Z'))).toEqual([
			{ dayStart: utc('2026-11-19T05:00:00Z'), workedMs: minutes(30) }
		]);
	});

	it('gives each day of a stretch longer than a day, with whole days between', () => {
		// 18:00 Nov 19 to 06:00 Nov 21 in New York.
		expect(splitAtMidnight(utc('2026-11-19T23:00:00Z'), utc('2026-11-21T11:00:00Z'))).toEqual([
			{ dayStart: utc('2026-11-19T05:00:00Z'), workedMs: hours(6) },
			{ dayStart: utc('2026-11-20T05:00:00Z'), workedMs: hours(24) },
			{ dayStart: utc('2026-11-21T05:00:00Z'), workedMs: hours(6) }
		]);
	});

	it('gives the 2.5 real hours after midnight when the clocks go forward at 02:00', () => {
		// 23:30 EST on Mar 7 to 03:30 EDT on Mar 8 is 3 real hours, since 02:00 to 03:00 never happens.
		expect(splitAtMidnight(utc('2026-03-08T04:30:00Z'), utc('2026-03-08T07:30:00Z'))).toEqual([
			{ dayStart: utc('2026-03-07T05:00:00Z'), workedMs: minutes(30) },
			{ dayStart: utc('2026-03-08T05:00:00Z'), workedMs: hours(2.5) }
		]);
	});

	it('counts a 23-hour day as 23 hours of a stretch across it', () => {
		// 12:00 EST on Mar 7 to 12:00 EDT on Mar 9 is 47 real hours.
		expect(splitAtMidnight(utc('2026-03-07T17:00:00Z'), utc('2026-03-09T16:00:00Z'))).toEqual([
			{ dayStart: utc('2026-03-07T05:00:00Z'), workedMs: hours(12) },
			{ dayStart: utc('2026-03-08T05:00:00Z'), workedMs: hours(23) },
			{ dayStart: utc('2026-03-09T04:00:00Z'), workedMs: hours(12) }
		]);
	});

	it('counts a 25-hour day as 25 hours of a stretch across it', () => {
		// 12:00 EDT on Oct 31 to 12:00 EST on Nov 2 is 49 real hours.
		expect(splitAtMidnight(utc('2026-10-31T16:00:00Z'), utc('2026-11-02T17:00:00Z'))).toEqual([
			{ dayStart: utc('2026-10-31T04:00:00Z'), workedMs: hours(12) },
			{ dayStart: utc('2026-11-01T04:00:00Z'), workedMs: hours(25) },
			{ dayStart: utc('2026-11-02T05:00:00Z'), workedMs: hours(12) }
		]);
	});

	it('gives nothing for an empty stretch', () => {
		expect(splitAtMidnight(utc('2026-11-19T14:00:00Z'), utc('2026-11-19T14:00:00Z'))).toEqual([]);
	});

	it('gives nothing for a stretch that ends before it starts', () => {
		expect(splitAtMidnight(utc('2026-11-19T14:00:00Z'), utc('2026-11-19T13:00:00Z'))).toEqual([]);
	});

	it('ends a slice exactly at midnight without adding an empty one', () => {
		expect(splitAtMidnight(utc('2026-11-20T04:00:00Z'), utc('2026-11-20T05:00:00Z'))).toEqual([
			{ dayStart: utc('2026-11-19T05:00:00Z'), workedMs: hours(1) }
		]);
	});
});

describe('daySlicesOf', () => {
	it('gives nothing when there are no work periods', () => {
		expect(daySlicesOf([])).toEqual([]);
	});

	it('splits each segment of each period, so paused time does not count', () => {
		const periods = [
			workPeriodWith({
				segments: [
					{ start: '2026-11-20T04:50:00.000Z', end: '2026-11-20T05:00:00.000Z' },
					{ start: '2026-11-20T05:10:00.000Z', end: '2026-11-20T05:20:00.000Z' }
				]
			}),
			workPeriodWith({
				segments: [{ start: '2026-11-20T15:00:00.000Z', end: '2026-11-20T15:05:00.000Z' }]
			})
		];

		expect(daySlicesOf(periods)).toEqual([
			{ dayStart: utc('2026-11-19T05:00:00Z'), workedMs: minutes(10) },
			{ dayStart: utc('2026-11-20T05:00:00Z'), workedMs: minutes(10) },
			{ dayStart: utc('2026-11-20T05:00:00Z'), workedMs: minutes(5) }
		]);
	});

	it('gives nothing for a period with no segments', () => {
		expect(daySlicesOf([workPeriodWith({ segments: [], workedMs: 0 })])).toEqual([]);
	});
});
