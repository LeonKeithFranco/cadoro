// Percentages, worked out as exactly as floating point allows.

/**
 * Works out a percentage of a value.
 *
 * @param value - The value to take a percentage of.
 * @param percent - The percentage, such as `20` for 20%.
 * @returns `percent`% of `value`, exact whenever the result can be stored exactly.
 */
export function percentOf(value: number, percent: number): number {
	// Multiply before dividing: `percent / 100` is inexact in binary (0.29 is 0.28999…), which
	// can turn an exact result, such as 14,500, into 14,499.999… A whole-number product divided
	// once is rounded only once, so it's as exact as the result can be stored.
	return (value * percent) / 100;
}
