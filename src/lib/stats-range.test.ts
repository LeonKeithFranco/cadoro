import './testing/time-zone';
import { describe, expect, it } from 'vitest';
import type { DaySlice } from './day-slices';
import { minutes } from './testing/durations';
import { utc } from './testing/moments';
import { RANGE_PRESETS, rangeForPreset } from './stats-range';

/** Midday on Thursday Nov 19 2026 in New York. */
const NOW = utc('2026-11-19T17:00:00Z');

/** The local midnight that starts Nov 19 2026. */
const TODAY = utc('2026-11-19T05:00:00Z');

describe('RANGE_PRESETS', () => {
	it('lists the spec presets in order', () => {
		expect(RANGE_PRESETS).toEqual(['7d', '30d', '90d', '1y', 'all']);
	});
});

describe('rangeForPreset', () => {
	it.each<[preset: '7d' | '30d' | '90d' | '1y', firstDay: string]>([
		['7d', '2026-11-13T05:00:00Z'],
		['30d', '2026-10-21T04:00:00Z'],
		['90d', '2026-08-22T04:00:00Z'],
		['1y', '2025-11-20T05:00:00Z']
	])('counts %s back from today, today included, so it starts on %s', (preset, firstDay) => {
		expect(rangeForPreset(preset, NOW, [])).toEqual({ firstDay: utc(firstDay), lastDay: TODAY });
	});

	it('uses local days, so a moment just after local midnight is the new day', () => {
		const justAfterMidnight = utc('2026-11-19T05:01:00Z');

		expect(rangeForPreset('7d', justAfterMidnight, []).lastDay).toBe(TODAY);
	});

	it('starts "all" on the first day with work', () => {
		const slices: DaySlice[] = [
			{ dayStart: utc('2026-11-17T05:00:00Z'), workedMs: minutes(25) },
			{ dayStart: utc('2026-09-02T04:00:00Z'), workedMs: minutes(25) }
		];

		expect(rangeForPreset('all', NOW, slices)).toEqual({
			firstDay: utc('2026-09-02T04:00:00Z'),
			lastDay: TODAY
		});
	});

	it('starts "all" on the first day with work however many slices there are', () => {
		const manySlices: DaySlice[] = Array.from({ length: 300_000 }, () => ({
			dayStart: utc('2026-11-17T05:00:00Z'),
			workedMs: minutes(25)
		}));
		manySlices.push({ dayStart: utc('2026-09-02T04:00:00Z'), workedMs: minutes(25) });

		expect(rangeForPreset('all', NOW, manySlices).firstDay).toBe(utc('2026-09-02T04:00:00Z'));
	});

	it('gives just today for "all" when there is no work', () => {
		expect(rangeForPreset('all', NOW, [])).toEqual({ firstDay: TODAY, lastDay: TODAY });
	});

	it('gives just today for "all" when the only work is later than today', () => {
		const slices: DaySlice[] = [{ dayStart: utc('2026-11-25T05:00:00Z'), workedMs: minutes(25) }];

		expect(rangeForPreset('all', NOW, slices)).toEqual({ firstDay: TODAY, lastDay: TODAY });
	});
});
