import { describe, expect, it } from 'vitest';
import { formatElapsed, formatRemaining } from './time';

/** One row of a formatting table: the rule it shows, a duration and how it should look. */
type Case = [rule: string, ms: number, shown: string];

describe('formatElapsed', () => {
	it.each<Case>([
		['starts at 0:00', 0, '0:00'],
		['rounds down below a whole second', 999, '0:00'],
		['shows a second once it has fully passed', 1_000, '0:01'],
		['rounds down just below a minute', 59_999, '0:59'],
		['pads the seconds to two digits', 60_000, '1:00'],
		['shows minutes without padding', 25 * 60_000, '25:00'],
		['stays m:ss just below an hour', 3_599_999, '59:59'],
		['switches to h:mm:ss at an hour', 3_600_000, '1:00:00'],
		['pads the minutes from an hour', 3_661_000, '1:01:01'],
		['shows hours without padding', 36_000_000, '10:00:00'],
		['shows a negative time as 0:00', -500, '0:00']
	])('%s: %i ms shows as %s', (_rule, ms, shown) => {
		expect(formatElapsed(ms)).toBe(shown);
	});
});

describe('formatRemaining', () => {
	it.each<Case>([
		['shows a whole countdown as it starts', 300_000, '5:00'],
		['rounds up while any of a second is left', 299_001, '5:00'],
		['drops a second once it has fully passed', 299_000, '4:59'],
		['shows 0:01 until the very end', 1, '0:01'],
		['reaches 0:00 exactly at the end', 0, '0:00'],
		['shows a negative time as 0:00', -1, '0:00'],
		['rounds up to an hour', 3_599_001, '1:00:00'],
		['stays m:ss once below an hour', 3_599_000, '59:59']
	])('%s: %i ms shows as %s', (_rule, ms, shown) => {
		expect(formatRemaining(ms)).toBe(shown);
	});
});
