// The activity log's entries, shaped as in the data model in `docs/SPEC.md`.

/** How many entries the log keeps. Once it holds more, the oldest are dropped. */
export const LOG_MAX_ENTRIES = 5000;

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
