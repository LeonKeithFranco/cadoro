// Time units and formats: converting minutes, stamping moments for storage and reading them back, and formatting
// durations for the timer as `m:ss` under an hour and `h:mm:ss` from an hour.

/** The milliseconds in one second. */
export const MS_PER_SECOND = 1000;

/** The seconds in one minute. */
const SECONDS_PER_MINUTE = 60;

/** The seconds in one hour. */
const SECONDS_PER_HOUR = 60 * SECONDS_PER_MINUTE;

/**
 * Converts whole minutes, such as a block's target, to milliseconds.
 *
 * @param minutes - The minutes to convert.
 * @returns The same length of time in milliseconds.
 */
export function minutesToMs(minutes: number): number {
	return minutes * SECONDS_PER_MINUTE * MS_PER_SECOND;
}

/**
 * Converts a moment from the run engine's milliseconds to the UTC timestamp storage keeps.
 *
 * @remarks
 * The engine works in milliseconds, which are easy to add and compare, while storage keeps exact
 * moments as UTC timestamps, which stay readable in a backup and in DevTools.
 *
 * @param ms - The moment, in milliseconds since 1970 (UTC), as `Date.now()` gives.
 * @returns The moment as an ISO 8601 timestamp in UTC, to the millisecond, such as
 * `2026-11-19T09:30:00.000Z`.
 */
export function toUtcTimestamp(ms: number): string {
	return new Date(ms).toISOString();
}

/**
 * Converts a UTC timestamp from storage back to the run engine's milliseconds, undoing
 * {@link toUtcTimestamp}.
 *
 * @param timestamp - The moment as an ISO 8601 timestamp, such as `2026-11-19T09:30:00.000Z`.
 * @returns The moment, in milliseconds since 1970 (UTC), to the millisecond. A string that isn't
 * a timestamp gives `NaN`, as `Date.parse` does.
 */
export function fromUtcTimestamp(timestamp: string): number {
	return Date.parse(timestamp);
}

/**
 * Formats time that has passed, such as work done so far.
 *
 * @remarks
 * Rounds down to the whole second, so `0:01` shows only once a full second has passed, as on a
 * stopwatch.
 *
 * @param ms - The time passed, in milliseconds. A negative value shows as `0:00`.
 * @returns The time as `m:ss` under an hour, such as `25:00`, or `h:mm:ss` from an hour, such as
 * `1:02:03`.
 */
export function formatElapsed(ms: number): string {
	const wholeSeconds = Math.floor(ms / MS_PER_SECOND);
	return formatSeconds(wholeSeconds);
}

/**
 * Formats time that's left, such as what remains of a break.
 *
 * @remarks
 * Rounds up to the whole second, so a 5-minute countdown shows `5:00` when it starts and reaches
 * `0:00` exactly when it ends, rather than a second early.
 *
 * @param ms - The time left, in milliseconds. A negative value shows as `0:00`.
 * @returns The time as `m:ss` under an hour, such as `4:59`, or `h:mm:ss` from an hour.
 */
export function formatRemaining(ms: number): string {
	const wholeSeconds = roundUpToWholeSecondsMs(ms) / MS_PER_SECOND;
	return formatSeconds(wholeSeconds);
}

/**
 * Rounds a length of time up to a whole number of seconds.
 *
 * @remarks
 * This is the rounding of a countdown: it's what {@link formatRemaining} shows, so a length
 * rounded with it is exactly the time the timer displayed.
 *
 * @param ms - The time, in milliseconds.
 * @returns The time rounded up to the next whole second, in whole seconds, as milliseconds. A
 * time that is already whole seconds is unchanged.
 */
export function roundUpToWholeSecondsMs(ms: number): number {
	return Math.ceil(ms / MS_PER_SECOND) * MS_PER_SECOND;
}

/**
 * Formats a whole number of seconds as `m:ss` or `h:mm:ss`.
 *
 * @param totalSeconds - The whole seconds to show. A negative value shows as `0:00`.
 * @returns The seconds as `m:ss` under an hour, or `h:mm:ss` from an hour.
 */
function formatSeconds(totalSeconds: number): string {
	const shownSeconds = Math.max(0, totalSeconds);

	const hours = Math.floor(shownSeconds / SECONDS_PER_HOUR);
	const minutesPastHour = Math.floor((shownSeconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
	const secondsPastMinute = shownSeconds % SECONDS_PER_MINUTE;

	if (hours === 0) {
		return `${minutesPastHour}:${twoDigits(secondsPastMinute)}`;
	}
	return `${hours}:${twoDigits(minutesPastHour)}:${twoDigits(secondsPastMinute)}`;
}

/**
 * Pads a number below 100 to two digits, such as `7` to `07`.
 *
 * @param value - A whole number from 0 to 99.
 * @returns The number as two digits.
 */
function twoDigits(value: number): string {
	return String(value).padStart(2, '0');
}
