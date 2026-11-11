// Lengths of time for tests, in milliseconds, the unit every time in the app is in. Tests write
// `minutes(25)` rather than `25 * 60_000`, so the data stays visible and the conversion is
// written once. They're deliberately separate from `time.ts`, so a test's expected values don't
// come from the code it checks.

/**
 * Converts whole seconds to milliseconds.
 *
 * @param count - The number of seconds.
 * @returns The same length of time in milliseconds.
 */
export function seconds(count: number): number {
	return count * 1_000;
}

/**
 * Converts whole minutes to milliseconds.
 *
 * @param count - The number of minutes.
 * @returns The same length of time in milliseconds.
 */
export function minutes(count: number): number {
	return seconds(count * 60);
}

/**
 * Converts whole hours to milliseconds.
 *
 * @param count - The number of hours.
 * @returns The same length of time in milliseconds.
 */
export function hours(count: number): number {
	return minutes(count * 60);
}
