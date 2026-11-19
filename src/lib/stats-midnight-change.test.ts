import { SANTIAGO_TIME_ZONE } from './testing/time-zone-santiago';
import { describe, expect, it } from 'vitest';
import { daySlicesOf, nextLocalDay, splitAtMidnight, startOfLocalDay } from './day-slices';
import { rangeForPreset } from './stats-range';
import { streaksOf } from './streaks';
import { minutes } from './testing/durations';
import { workPeriodWith } from './testing/run-records';
import { dailyTotals } from './work-totals';

/**
 * Reads a UTC timestamp as milliseconds, so each test writes its moments as readable literals.
 *
 * @param timestamp - A UTC timestamp, such as `2026-09-07T03:00:00Z`.
 * @returns The moment in milliseconds since 1970 (UTC).
 */
function utc(timestamp: string): number {
	return Date.parse(timestamp);
}

// In Santiago, midnight is 04:00 UTC (UTC-4) until the clocks change. On Sunday Sep 6 2026 they go
// from Saturday 23:59:59 to Sunday 01:00, so Sep 6 starts at 01:00 (04:00 UTC) and is 23 hours
// long, and from then on midnight is 03:00 UTC (UTC-3).

describe('days in a zone whose clocks change at midnight', () => {
	it('is Santiago, where Sep 6 2026 has no midnight', () => {
		expect(SANTIAGO_TIME_ZONE).toBe('America/Santiago');
		expect(startOfLocalDay(utc('2026-09-06T10:00:00Z'))).toBe(utc('2026-09-06T04:00:00Z'));
	});

	it('steps to the real midnight of the next day, not to 01:00 again', () => {
		expect(nextLocalDay(utc('2026-09-05T04:00:00Z'))).toBe(utc('2026-09-06T04:00:00Z'));
		expect(nextLocalDay(utc('2026-09-06T04:00:00Z'))).toBe(utc('2026-09-07T03:00:00Z'));
		expect(nextLocalDay(utc('2026-09-07T03:00:00Z'))).toBe(utc('2026-09-08T03:00:00Z'));
	});

	it('splits work across the change day at the midnight of Sep 7', () => {
		// 23:30 on Sep 6 to 00:30 on Sep 7 in Santiago.
		expect(splitAtMidnight(utc('2026-09-07T02:30:00Z'), utc('2026-09-07T03:30:00Z'))).toEqual([
			{ dayStart: utc('2026-09-06T04:00:00Z'), workedMs: minutes(30) },
			{ dayStart: utc('2026-09-07T03:00:00Z'), workedMs: minutes(30) }
		]);
	});

	it('gives the 7 days chart seven bars ending today, two days after the change', () => {
		// Noon on Sep 8 in Santiago.
		const now = utc('2026-09-08T16:00:00Z');

		const range = rangeForPreset('7d', now, []);

		expect(range).toEqual({
			firstDay: utc('2026-09-02T04:00:00Z'),
			lastDay: utc('2026-09-08T03:00:00Z')
		});
		expect(dailyTotals([], range).map((total) => total.start)).toEqual([
			utc('2026-09-02T04:00:00Z'),
			utc('2026-09-03T04:00:00Z'),
			utc('2026-09-04T04:00:00Z'),
			utc('2026-09-05T04:00:00Z'),
			utc('2026-09-06T04:00:00Z'),
			utc('2026-09-07T03:00:00Z'),
			utc('2026-09-08T03:00:00Z')
		]);
	});

	it('counts work across the change in the daily totals, today included', () => {
		const slices = daySlicesOf([
			workPeriodWith({
				segments: [{ start: '2026-09-07T02:30:00.000Z', end: '2026-09-07T03:30:00.000Z' }]
			})
		]);

		const totals = dailyTotals(slices, rangeForPreset('7d', utc('2026-09-07T16:00:00Z'), slices));

		expect(totals.at(-1)).toEqual({ start: utc('2026-09-07T03:00:00Z'), workedMs: minutes(30) });
		expect(totals.at(-2)).toEqual({ start: utc('2026-09-06T04:00:00Z'), workedMs: minutes(30) });
	});

	it('counts the days either side of the change as one streak', () => {
		const slices = [
			{ dayStart: utc('2026-09-06T04:00:00Z'), workedMs: minutes(25) },
			{ dayStart: utc('2026-09-07T03:00:00Z'), workedMs: minutes(25) }
		];

		expect(streaksOf(slices, utc('2026-09-07T16:00:00Z'))).toEqual({ current: 2, longest: 2 });
	});
});
