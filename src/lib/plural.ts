// Words a count with its unit.

/**
 * Words a count with its unit, in the singular for 1.
 *
 * @param count - How many.
 * @param unit - The unit in the singular, such as `run`.
 * @returns For example `1 run` or `3 runs`.
 */
export function counted(count: number, unit: string): string {
	return `${count} ${unit}${count === 1 ? '' : 's'}`;
}
