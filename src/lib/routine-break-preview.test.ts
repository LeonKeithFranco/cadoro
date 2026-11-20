import { describe, expect, it } from 'vitest';
import type { Block } from './routine';
import { breakAtTargetMs, describeBreakAtTarget } from './routine-break-preview';
import { hours, minutes, seconds } from './testing/durations';

/**
 * Makes a block for a test with the target and break percentage that matter.
 *
 * @param targetMinutes - The block's work target, in minutes.
 * @param breakPercent - The block's break percentage.
 * @returns A block with those two fields.
 */
function blockWith(targetMinutes: number, breakPercent: number): Block {
	return { id: 'block', title: 'Focus', targetMinutes, breakPercent, cycles: 1 };
}

describe('breakAtTargetMs', () => {
	it.each<[rule: string, targetMinutes: number, breakPercent: number, result: number]>([
		['takes the percentage of the target', 25, 20, minutes(5)],
		['gives 3:45 for 25 minutes at 15%', 25, 15, seconds(225)],
		['gives the smallest break at 1%', 25, 1, seconds(15)],
		['rounds to whole seconds as a real break does', 7, 33, seconds(139)],
		['rounds a fraction below half down, as 14.4 seconds', 2, 12, seconds(14)],
		['gives the whole target at 100%', 240, 100, hours(4)]
	])('%s', (_rule, targetMinutes, breakPercent, result) => {
		expect(breakAtTargetMs(blockWith(targetMinutes, breakPercent))).toBe(result);
	});
});

describe('describeBreakAtTarget', () => {
	it.each<[rule: string, targetMinutes: number, breakPercent: number, text: string]>([
		['says 5:00 for 25 minutes at 20%', 25, 20, '5:00 break at the 25-minute target'],
		['says 3:45 for 25 minutes at 15%', 25, 15, '3:45 break at the 25-minute target'],
		['says 0:15 for 25 minutes at 1%', 25, 1, '0:15 break at the 25-minute target'],
		['rounds 138.6 seconds up to 2:19', 7, 33, '2:19 break at the 7-minute target'],
		['rounds 14.4 seconds down to 0:14', 2, 12, '0:14 break at the 2-minute target'],
		['writes hours from an hour on', 240, 100, '4:00:00 break at the 240-minute target']
	])('%s', (_rule, targetMinutes, breakPercent, text) => {
		expect(describeBreakAtTarget(blockWith(targetMinutes, breakPercent))).toBe(text);
	});
});
