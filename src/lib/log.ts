// The activity log's entries, shaped as in the data model in `docs/SPEC.md`.

/** How many entries the log keeps. Once it holds more, the oldest are dropped. */
export const LOG_MAX_ENTRIES = 5000;

/**
 * How long, in milliseconds, after an error a repeat of it is still counted in the same entry.
 * It runs from the last repeat, so an error that keeps coming stays one entry.
 */
export const ERROR_REPEAT_WINDOW_MS = 60_000;

/** What an entry holds before storage gives it an id. */
export type NewLogEntry = {
	/** When it happened, as a UTC timestamp. */
	timestamp: string;
	/** `'change'` for a change to the user's data, `'error'` for an error the app caught. */
	type: 'change' | 'error';
	/** A sentence saying what happened, such as `Edited routine "Writing"`. */
	message: string;
	/** What the message leaves out, such as the old and new values of an edit. */
	details?: Record<string, unknown>;
};

/** One line of the activity log, as storage keeps it. */
export type LogEntry = NewLogEntry & {
	/** Counts up from 1 with each entry saved, so a higher id is a later entry. */
	id: number;
};

/**
 * Makes the entry for a change to the user's data.
 *
 * @param now - The moment of the change.
 * @param message - A sentence saying what changed.
 * @param details - What the message leaves out.
 * @returns A `change` entry stamped with `now`.
 */
export function changeEntry(
	now: Date,
	message: string,
	details: Record<string, unknown>
): NewLogEntry {
	return { timestamp: now.toISOString(), type: 'change', message, details };
}

/**
 * Counts an error in the entry before it, when it repeats that entry.
 *
 * @remarks
 * An error that repeats, such as an `error` event firing in a loop, would otherwise fill the
 * log and push the routine history out of it. A repeat is an error with the same message, and
 * the same error name and message, as the newest entry, which is itself an error, within
 * {@link ERROR_REPEAT_WINDOW_MS} of that entry's last repeat. The entry keeps its own id,
 * timestamp and details, as the first occurrence, and gains `details.count`, how many times it
 * happened, and `details.lastTimestamp`, when it last did.
 *
 * @param newest - The newest entry in the log, or `undefined` when the log is empty.
 * @param entry - The entry about to be added.
 * @returns The newest entry as it should now be saved, or `null` when `entry` doesn't repeat it
 * and is to be added as an entry of its own.
 */
export function withRepeatCounted(
	newest: LogEntry | undefined,
	entry: NewLogEntry
): LogEntry | null {
	if (newest?.type !== 'error' || entry.type !== 'error' || newest.message !== entry.message) {
		return null;
	}
	// The same error: its name and message, or for something thrown that isn't an `Error`, its text.
	for (const field of ['name', 'message', 'value']) {
		if (newest.details?.[field] !== entry.details?.[field]) {
			return null;
		}
	}

	const lastTimestamp = newest.details?.['lastTimestamp'];
	const lastMoment = typeof lastTimestamp === 'string' ? lastTimestamp : newest.timestamp;
	const sinceLastMs = Date.parse(entry.timestamp) - Date.parse(lastMoment);
	if (!(sinceLastMs <= ERROR_REPEAT_WINDOW_MS)) {
		return null;
	}

	const count = newest.details?.['count'];
	const timesSoFar = typeof count === 'number' ? count : 1;
	return {
		...newest,
		details: { ...newest.details, count: timesSoFar + 1, lastTimestamp: entry.timestamp }
	};
}
