import { describe, expect, it } from 'vitest';
import { asPercentOf, percentOf } from './percent';

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

describe('asPercentOf', () => {
	it.each<[rule: string, part: number, whole: number, result: number]>([
		['gives the percentage one value is of another', 750_000, 1_500_000, 50],
		['gives 0 for nothing', 0, 1_500_000, 0],
		['gives 100 for the whole', 1_500_000, 1_500_000, 100],
		['goes past 100 when the part is bigger', 1_900_000, 1_500_000, 126.66666666666667],
		['stays exact where dividing first would not', 29, 100, 29]
	])('%s', (_rule, part, whole, result) => {
		expect(asPercentOf(part, whole)).toBe(result);
	});
});
