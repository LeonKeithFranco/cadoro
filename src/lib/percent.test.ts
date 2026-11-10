import { describe, expect, it } from 'vitest';
import { percentOf } from './percent';

describe('percentOf', () => {
	it.each<[rule: string, value: number, percent: number, result: number]>([
		['takes a percentage of a value', 1_500_000, 20, 300_000],
		['gives the whole value at 100%', 61_500, 100, 61_500],
		['gives 0 of 0', 0, 20, 0],
		['keeps a fraction of a whole number', 1, 50, 0.5],
		['stays exact where dividing the percentage first would not', 50_000, 29, 14_500]
	])('%s', (_rule, value, percent, result) => {
		expect(percentOf(value, percent)).toBe(result);
	});
});
