// Moments for tests. Tests write the UTC timestamp they mean, such as `2026-11-20T05:00:00Z`,
// rather than a number of milliseconds, so the expected values can be checked by eye against
// the local midnights they stand for.

/**
 * Turns a UTC timestamp into a moment, for tests that write their times as strings.
 *
 * @param timestamp - A UTC timestamp, such as `2026-11-20T05:00:00Z`.
 * @returns The moment in milliseconds since 1970 (UTC).
 */
export function utc(timestamp: string): number {
	return Date.parse(timestamp);
}
