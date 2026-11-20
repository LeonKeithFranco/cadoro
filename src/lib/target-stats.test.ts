import { describe, expect, it } from 'vitest';
import { minutes, seconds } from './testing/durations';
import { workPeriodWith } from './testing/run-records';
import { targetsReached, timeAgainstTarget } from './target-stats';

describe('timeAgainstTarget', () => {
	it('is null when there are no work periods', () => {
		expect(timeAgainstTarget([])).toBeNull();
	});

	it('is 100 when a period worked exactly its target', () => {
		const periods = [workPeriodWith({ targetMinutes: 25, workedMs: minutes(25) })];

		expect(timeAgainstTarget(periods)).toBe(100);
	});

	it('goes past 100 for overtime', () => {
		const periods = [workPeriodWith({ targetMinutes: 25, workedMs: minutes(28) })];

		expect(timeAgainstTarget(periods)).toBe(112);
	});

	it('adds up time and targets before dividing, so a 4-second period barely moves it', () => {
		// 25 + 50 minutes of work against 25 + 50 minutes of target, plus 4 seconds against 25 minutes:
		// 4500 s + 4 s = 4504 s worked against 4500 s + 1500 s = 6000 s of target, which is 75.0666...%.
		const periods = [
			workPeriodWith({ targetMinutes: 25, workedMs: minutes(25) }),
			workPeriodWith({ targetMinutes: 50, workedMs: minutes(50) }),
			workPeriodWith({ targetMinutes: 25, workedMs: seconds(4) })
		];

		expect(timeAgainstTarget(periods)).toBeCloseTo(75.0667, 4);
	});

	it('weighs periods with 25 and 50 minute targets in proportion to their targets', () => {
		// 30 of 25 minutes and 40 of 50 minutes: 70 minutes against 75 minutes, not (120% + 80%) / 2.
		const periods = [
			workPeriodWith({ targetMinutes: 25, workedMs: minutes(30) }),
			workPeriodWith({ targetMinutes: 50, workedMs: minutes(40) })
		];

		expect(timeAgainstTarget(periods)).toBeCloseTo(93.3333, 4);
	});

	it('counts a period that Finish ended early at the time it worked, against its full target', () => {
		// Finish after 10 of 25 minutes, beside a period that worked all 25: 35 minutes against 50.
		const periods = [
			workPeriodWith({ targetMinutes: 25, workedMs: minutes(25) }),
			workPeriodWith({ targetMinutes: 25, workedMs: minutes(10) })
		];

		expect(timeAgainstTarget(periods)).toBe(70);
	});

	it('is 0 when nothing was worked against a target', () => {
		expect(timeAgainstTarget([workPeriodWith({ targetMinutes: 25, workedMs: 0 })])).toBe(0);
	});
});

describe('targetsReached', () => {
	it('counts a period that Finish ended before its target as not reached', () => {
		const periods = [
			workPeriodWith({ targetMinutes: 25, workedMs: minutes(25) }),
			workPeriodWith({ targetMinutes: 25, workedMs: minutes(10) })
		];

		expect(targetsReached(periods)).toBe(50);
	});

	it('is null when there are no work periods', () => {
		expect(targetsReached([])).toBeNull();
	});

	it('counts a period that worked exactly its target as reached', () => {
		const periods = [workPeriodWith({ targetMinutes: 25, workedMs: minutes(25) })];

		expect(targetsReached(periods)).toBe(100);
	});

	it('does not count a period a millisecond short of its target', () => {
		const periods = [workPeriodWith({ targetMinutes: 25, workedMs: minutes(25) - 1 })];

		expect(targetsReached(periods)).toBe(0);
	});

	it('gives the share of periods that reached their target', () => {
		const periods = [
			workPeriodWith({ targetMinutes: 25, workedMs: minutes(30) }),
			workPeriodWith({ targetMinutes: 25, workedMs: minutes(10) }),
			workPeriodWith({ targetMinutes: 50, workedMs: minutes(50) }),
			workPeriodWith({ targetMinutes: 50, workedMs: minutes(49) })
		];

		expect(targetsReached(periods)).toBe(50);
	});

	it('counts each period the same, whatever its target', () => {
		const periods = [
			workPeriodWith({ targetMinutes: 5, workedMs: minutes(5) }),
			workPeriodWith({ targetMinutes: 240, workedMs: minutes(1) })
		];

		expect(targetsReached(periods)).toBe(50);
	});
});
