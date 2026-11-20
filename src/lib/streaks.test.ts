import './testing/time-zone';
import { describe, expect, it } from 'vitest';
import type { DaySlice } from './day-slices';
import { minutes } from './testing/durations';
import { utc } from './testing/moments';
import { streaksOf } from './streaks';

/**
 * Makes slices of work, one 25-minute slice for each local midnight given.
 *
 * @param dayStarts - The UTC timestamps of the local midnights of the days with work.
 * @returns The slices.
 */
function workOn(...dayStarts: string[]): DaySlice[] {
	return dayStarts.map((dayStart) => ({ dayStart: utc(dayStart), workedMs: minutes(25) }));
}

/** Midday on Thursday Nov 19 2026 in New York. */
const NOW = utc('2026-11-19T17:00:00Z');

describe('streaksOf', () => {
	it('is 0 and 0 when there is no work', () => {
		expect(streaksOf([], NOW)).toEqual({ current: 0, longest: 0 });
	});

	it('counts the days in a row that end today', () => {
		const slices = workOn('2026-11-17T05:00:00Z', '2026-11-18T05:00:00Z', '2026-11-19T05:00:00Z');

		expect(streaksOf(slices, NOW)).toEqual({ current: 3, longest: 3 });
	});

	it('keeps the current streak alive through today when there is no work yet today', () => {
		const slices = workOn('2026-11-17T05:00:00Z', '2026-11-18T05:00:00Z');

		expect(streaksOf(slices, NOW)).toEqual({ current: 2, longest: 2 });
	});

	it('drops the current streak to 0 once a whole day has passed without work', () => {
		const slices = workOn('2026-11-16T05:00:00Z', '2026-11-17T05:00:00Z');

		expect(streaksOf(slices, NOW)).toEqual({ current: 0, longest: 2 });
	});

	it('counts today alone as a streak of 1', () => {
		expect(streaksOf(workOn('2026-11-19T05:00:00Z'), NOW)).toEqual({ current: 1, longest: 1 });
	});

	it('counts a day with several slices once', () => {
		const slices = [...workOn('2026-11-19T05:00:00Z'), ...workOn('2026-11-19T05:00:00Z')];

		expect(streaksOf(slices, NOW)).toEqual({ current: 1, longest: 1 });
	});

	it('breaks a streak at a day without work', () => {
		const slices = workOn('2026-11-15T05:00:00Z', '2026-11-17T05:00:00Z', '2026-11-18T05:00:00Z');

		expect(streaksOf(slices, NOW)).toEqual({ current: 2, longest: 2 });
	});

	it('finds a longest streak that is older than the current one', () => {
		const slices = workOn(
			'2026-11-01T04:00:00Z',
			'2026-11-02T05:00:00Z',
			'2026-11-03T05:00:00Z',
			'2026-11-04T05:00:00Z',
			'2026-11-18T05:00:00Z'
		);

		expect(streaksOf(slices, NOW)).toEqual({ current: 1, longest: 4 });
	});

	it('does not care what order the work is in', () => {
		const slices = workOn('2026-11-19T05:00:00Z', '2026-11-17T05:00:00Z', '2026-11-18T05:00:00Z');

		expect(streaksOf(slices, NOW)).toEqual({ current: 3, longest: 3 });
	});

	it('keeps a streak going across the day the clocks go back, which is 25 hours long', () => {
		const slices = workOn('2026-10-31T04:00:00Z', '2026-11-01T04:00:00Z', '2026-11-02T05:00:00Z');

		expect(streaksOf(slices, utc('2026-11-02T17:00:00Z'))).toEqual({ current: 3, longest: 3 });
	});

	it('keeps a streak going across the day the clocks go forward, which is 23 hours long', () => {
		const slices = workOn('2026-03-07T05:00:00Z', '2026-03-08T05:00:00Z', '2026-03-09T04:00:00Z');

		expect(streaksOf(slices, utc('2026-03-09T17:00:00Z'))).toEqual({ current: 3, longest: 3 });
	});

	it('uses the local day for today, so 04:30 UTC on the 20th is still the 19th', () => {
		const slices = workOn('2026-11-18T05:00:00Z', '2026-11-19T05:00:00Z');

		expect(streaksOf(slices, utc('2026-11-20T04:30:00Z'))).toEqual({ current: 2, longest: 2 });
	});

	it('ignores work later than today for the current streak but not the longest', () => {
		const slices = workOn('2026-11-18T05:00:00Z', '2026-11-21T05:00:00Z', '2026-11-22T05:00:00Z');

		expect(streaksOf(slices, NOW)).toEqual({ current: 1, longest: 2 });
	});
});
