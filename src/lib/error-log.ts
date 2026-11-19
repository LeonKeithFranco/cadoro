// Recording errors in the activity log, as the spec's Activity log section asks: an `error` entry
// whose message says what failed and whose details hold the error. Recording never throws, so
// an error handler can't cause an error of its own.

import type { NewLogEntry } from './log';

/** What error recording needs from storage: a way to add an entry to the activity log. */
export type ErrorLog = {
	/**
	 * Adds an entry to the activity log.
	 *
	 * @param entry - The entry, to which storage gives an id.
	 * @throws Rejects with the backend's own error when the entry can't be written.
	 */
	addLogEntry(entry: NewLogEntry): Promise<void>;
};

/** The log that {@link recordError} writes to, or `null` before the app has opened storage. */
let appLog: ErrorLog | null = null;

/**
 * Chooses the log that {@link recordError} writes to, which the app does once storage is open.
 *
 * @remarks
 * Errors recorded before this, or after it is called with `null`, go to `console.error` instead,
 * so none is lost silently.
 *
 * @param log - The log to write to, or `null` for none.
 */
export function useErrorLog(log: ErrorLog | null): void {
	appLog = log;
}

/**
 * Turns a value of any kind that was thrown into details a log entry can hold and export as
 * JSON.
 *
 * @param error - What was thrown, which needn't be an `Error`.
 * @returns For an `Error`, its name, message, stack and, when it has one, its cause, in the same
 * shape. For anything else, its text as `value`.
 */
export function errorDetails(error: unknown): Record<string, unknown> {
	if (error instanceof Error) {
		const details: Record<string, unknown> = {
			name: error.name,
			message: error.message,
			stack: error.stack ?? null
		};
		if (error.cause !== undefined) {
			details['cause'] = errorDetails(error.cause);
		}
		return details;
	}
	return { value: describeValue(error) };
}

/**
 * Writes a thrown value that isn't an `Error` as text.
 *
 * @param value - The value.
 * @returns The value itself when it's text, else its JSON, else what `String` makes of it.
 */
function describeValue(value: unknown): string {
	if (typeof value === 'string') {
		return value;
	}
	try {
		return JSON.stringify(value) ?? String(value);
	} catch {
		return String(value);
	}
}

/**
 * Records an error in a log, falling back to `console.error` when that can't be done.
 *
 * @param log - The log to write to, or `null` when there is none.
 * @param message - A sentence saying what failed, such as `The run could not be saved.`
 * @param error - What was thrown.
 * @param now - The moment of the error.
 * @returns A promise that settles once the entry is written or the fallback has run. It never
 * rejects.
 */
export async function recordErrorIn(
	log: ErrorLog | null,
	message: string,
	error: unknown,
	now: Date
): Promise<void> {
	if (log === null) {
		console.error(message, error);
		return;
	}

	try {
		await log.addLogEntry({
			timestamp: now.toISOString(),
			type: 'error',
			message,
			details: errorDetails(error)
		});
	} catch {
		// The log can't take the entry, so the console is the only place left to say what failed.
		console.error(message, error);
	}
}

/**
 * Records an error in the app's activity log, as chosen by {@link useErrorLog}.
 *
 * @param message - A sentence saying what failed, such as `The run could not be saved.`
 * @param error - What was thrown.
 * @returns A promise that settles once the entry is written or the fallback has run. It never
 * rejects, so callers that don't wait for it, as an error handler doesn't, may use `void`.
 */
export function recordError(message: string, error: unknown): Promise<void> {
	return recordErrorIn(appLog, message, error, new Date());
}
