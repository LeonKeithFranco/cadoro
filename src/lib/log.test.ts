import { describe, expect, it } from 'vitest';
import { ERROR_REPEAT_WINDOW_MS, withRepeatCounted, type LogEntry, type NewLogEntry } from './log';

/** The moment of the first error in these tests, as a UTC timestamp. */
const FIRST_MOMENT = '2026-11-19T10:00:00.000Z';

/**
 * Makes an error entry as storage keeps it.
 *
 * @param changes - What differs from the usual entry: any field, such as its details.
 * @returns A saved `error` entry with id 1, at {@link FIRST_MOMENT}, whose error is a plain
 * `Error` named `Error` with the message `x`.
 */
function savedError(changes: Partial<LogEntry> = {}): LogEntry {
	return {
		id: 1,
		timestamp: FIRST_MOMENT,
		type: 'error',
		message: 'Something failed.',
		details: { name: 'Error', message: 'x' },
		...changes
	};
}

/**
 * Makes an error entry about to be added, which repeats {@link savedError} unless told otherwise.
 *
 * @param changes - What differs from the usual entry: any field, such as its timestamp.
 * @returns An `error` entry at {@link FIRST_MOMENT}.
 */
function newError(changes: Partial<NewLogEntry> = {}): NewLogEntry {
	return {
		timestamp: FIRST_MOMENT,
		type: 'error',
		message: 'Something failed.',
		details: { name: 'Error', message: 'x' },
		...changes
	};
}

/**
 * Makes a timestamp a number of milliseconds after {@link FIRST_MOMENT}.
 *
 * @param offsetMs - How long after, in milliseconds. Negative for before.
 * @returns The moment as a UTC timestamp.
 */
function afterFirstMoment(offsetMs: number): string {
	return new Date(Date.parse(FIRST_MOMENT) + offsetMs).toISOString();
}

describe('withRepeatCounted', () => {
	it('counts a repeat in the newest entry, keeping its id, timestamp and details', () => {
		const newest = savedError({ id: 7 });

		const counted = withRepeatCounted(newest, newError({ timestamp: afterFirstMoment(5000) }));

		expect(counted).toEqual({
			...newest,
			details: {
				name: 'Error',
				message: 'x',
				count: 2,
				lastTimestamp: afterFirstMoment(5000)
			}
		});
	});

	it('counts on from the count the newest entry already has', () => {
		const newest = savedError({
			details: { name: 'Error', message: 'x', count: 3, lastTimestamp: afterFirstMoment(1000) }
		});

		const counted = withRepeatCounted(newest, newError({ timestamp: afterFirstMoment(2000) }));

		expect(counted?.details).toMatchObject({ count: 4, lastTimestamp: afterFirstMoment(2000) });
	});

	it('returns null when the log is empty', () => {
		expect(withRepeatCounted(undefined, newError())).toBeNull();
	});

	describe('what makes an error the same one', () => {
		it('counts a thrown value that is not an Error, by its text, as a repeat', () => {
			const newest = savedError({ details: { value: 'just a string' } });

			const counted = withRepeatCounted(
				newest,
				newError({ timestamp: afterFirstMoment(1000), details: { value: 'just a string' } })
			);

			expect(counted?.details).toEqual({
				value: 'just a string',
				count: 2,
				lastTimestamp: afterFirstMoment(1000)
			});
		});

		it('returns null for a thrown value that is not an Error and has other text', () => {
			const newest = savedError({ details: { value: 'just a string' } });

			expect(
				withRepeatCounted(newest, newError({ details: { value: 'another string' } }))
			).toBeNull();
		});

		it('returns null when only the message of the entry differs', () => {
			expect(
				withRepeatCounted(savedError(), newError({ message: 'Something else failed.' }))
			).toBeNull();
		});

		it('returns null when only the name of the error differs', () => {
			expect(
				withRepeatCounted(savedError(), newError({ details: { name: 'TypeError', message: 'x' } }))
			).toBeNull();
		});

		it('returns null when only the message of the error differs', () => {
			expect(
				withRepeatCounted(savedError(), newError({ details: { name: 'Error', message: 'y' } }))
			).toBeNull();
		});

		it('returns null when the newest entry is a change, not an error', () => {
			expect(withRepeatCounted(savedError({ type: 'change' }), newError())).toBeNull();
		});

		it('returns null when the entry is a change, not an error', () => {
			expect(withRepeatCounted(savedError(), newError({ type: 'change' }))).toBeNull();
		});
	});

	describe('the repeat window', () => {
		it('counts an error exactly the window after the newest entry', () => {
			const counted = withRepeatCounted(
				savedError(),
				newError({ timestamp: afterFirstMoment(ERROR_REPEAT_WINDOW_MS) })
			);

			expect(counted?.details).toMatchObject({ count: 2 });
		});

		it('returns null for an error a millisecond after the window', () => {
			expect(
				withRepeatCounted(
					savedError(),
					newError({ timestamp: afterFirstMoment(ERROR_REPEAT_WINDOW_MS + 1) })
				)
			).toBeNull();
		});

		it('measures the window from the last repeat, not from the first occurrence', () => {
			const newest = savedError({
				details: {
					name: 'Error',
					message: 'x',
					count: 2,
					lastTimestamp: afterFirstMoment(50_000)
				}
			});

			const counted = withRepeatCounted(newest, newError({ timestamp: afterFirstMoment(100_000) }));

			expect(counted?.details).toMatchObject({
				count: 3,
				lastTimestamp: afterFirstMoment(100_000)
			});
		});

		it('counts an error stamped before the newest entry, as when the clock moved back', () => {
			const newest = savedError({
				details: { name: 'Error', message: 'x', count: 2, lastTimestamp: afterFirstMoment(30_000) }
			});

			const counted = withRepeatCounted(newest, newError({ timestamp: afterFirstMoment(10_000) }));

			// A negative gap is within the window, so it's a repeat, and `lastTimestamp` goes back too.
			expect(counted?.details).toMatchObject({
				count: 3,
				lastTimestamp: afterFirstMoment(10_000)
			});
		});

		it('returns null when the entry’s timestamp is not a date', () => {
			expect(withRepeatCounted(savedError(), newError({ timestamp: 'not a date' }))).toBeNull();
		});
	});
});
