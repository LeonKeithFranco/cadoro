import { afterEach, describe, expect, it, vi } from 'vitest';
import { errorDetails, recordError, recordErrorIn, useErrorLog, type ErrorLog } from './error-log';
import { InMemoryStorage } from './storage/in-memory-storage';

/** The moment the tests record their errors at. */
const NOW = new Date('2026-11-19T10:00:00.000Z');

describe('errorDetails', () => {
	it('holds an error’s name, message and stack', () => {
		const error = new RangeError('Out of range');

		expect(errorDetails(error)).toEqual({
			name: 'RangeError',
			message: 'Out of range',
			stack: error.stack
		});
	});

	it('holds the cause of an error, in the same shape', () => {
		const error = new Error('Outer', { cause: new TypeError('Inner') });

		const details = errorDetails(error);

		expect(details['cause']).toMatchObject({ name: 'TypeError', message: 'Inner' });
	});

	it('holds text that was thrown as it is', () => {
		expect(errorDetails('plain text')).toEqual({ value: 'plain text' });
	});

	it('holds another kind of value as JSON', () => {
		expect(errorDetails({ status: 500 })).toEqual({ value: '{"status":500}' });
	});

	it('holds a value JSON cannot write as what String makes of it', () => {
		const circular: Record<string, unknown> = {};
		circular['self'] = circular;

		expect(errorDetails(circular)).toEqual({ value: '[object Object]' });
	});

	it('holds undefined as its text', () => {
		expect(errorDetails(undefined)).toEqual({ value: 'undefined' });
	});
});

describe('recordErrorIn', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('adds an error entry with the message, the moment and the error’s details', async () => {
		const storage = new InMemoryStorage();

		await recordErrorIn(storage, 'The run could not be saved.', new Error('Disk full'), NOW);

		const [entry] = await storage.getLogEntries();
		expect(entry).toMatchObject({
			type: 'error',
			message: 'The run could not be saved.',
			timestamp: '2026-11-19T10:00:00.000Z',
			details: { name: 'Error', message: 'Disk full' }
		});
	});

	it('does not write to the console when the entry is written', async () => {
		const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

		await recordErrorIn(new InMemoryStorage(), 'Failed.', new Error('x'), NOW);

		expect(logged).not.toHaveBeenCalled();
	});

	it('falls back to the console, and does not throw, when the log write fails', async () => {
		const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
		const failure = new Error('x');
		const brokenLog: ErrorLog = {
			addLogEntry: () => Promise.reject(new Error('The disk is full.'))
		};

		await expect(recordErrorIn(brokenLog, 'Failed.', failure, NOW)).resolves.toBeUndefined();

		expect(logged).toHaveBeenCalledWith('Failed.', failure);
	});

	it('falls back to the console when there is no log', async () => {
		const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
		const failure = new Error('x');

		await recordErrorIn(null, 'Failed.', failure, NOW);

		expect(logged).toHaveBeenCalledWith('Failed.', failure);
	});
});

describe('recordError', () => {
	afterEach(() => {
		useErrorLog(null);
		vi.restoreAllMocks();
	});

	it('writes to the log the app chose', async () => {
		const storage = new InMemoryStorage();
		useErrorLog(storage);

		await recordError('Failed.', new Error('x'));

		expect((await storage.getLogEntries()).map((entry) => entry.message)).toEqual(['Failed.']);
	});

	it('goes to the console before a log is chosen', async () => {
		const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
		const failure = new Error('x');

		await recordError('Failed.', failure);

		expect(logged).toHaveBeenCalledWith('Failed.', failure);
	});

	it('goes to the console again once the log is taken away', async () => {
		const storage = new InMemoryStorage();
		useErrorLog(storage);
		useErrorLog(null);
		const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

		await recordError('Failed.', new Error('x'));

		expect(logged).toHaveBeenCalledTimes(1);
		expect(await storage.getLogEntries()).toEqual([]);
	});
});
