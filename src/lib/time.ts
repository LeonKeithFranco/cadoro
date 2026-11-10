// Formatting durations for the timer: `m:ss` under an hour and `h:mm:ss` from an hour.

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
	return formatSeconds(Math.floor(ms / 1000));
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
	return formatSeconds(Math.ceil(ms / 1000));
}

/**
 * Formats a whole number of seconds as `m:ss` or `h:mm:ss`.
 *
 * @param totalSeconds - The whole seconds to show. A negative value shows as `0:00`.
 * @returns The seconds as `m:ss` under an hour, or `h:mm:ss` from an hour.
 */
function formatSeconds(totalSeconds: number): string {
	const seconds = Math.max(0, totalSeconds);
	const hours = Math.floor(seconds / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	const ss = twoDigits(seconds % 60);

	return hours > 0 ? `${hours}:${twoDigits(minutes)}:${ss}` : `${minutes}:${ss}`;
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
