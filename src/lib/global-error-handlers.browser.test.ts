import { afterEach, describe, expect, it } from 'vitest';
import { useErrorLog } from './error-log';
import { installGlobalErrorHandlers } from './global-error-handlers';
import { InMemoryStorage } from './storage/in-memory-storage';

// Each test gives the handlers a target of its own, not `window`, so the events it sends can't
// reach the test runner's own error reporting.

// Takes the log away again, so no test records into another's.
afterEach(() => {
	useErrorLog(null);
});

describe('installGlobalErrorHandlers', () => {
	it('records an uncaught error with its details', async () => {
		const storage = new InMemoryStorage();
		useErrorLog(storage);
		const target = new EventTarget();
		installGlobalErrorHandlers(target);

		target.dispatchEvent(new ErrorEvent('error', { error: new TypeError('Not a function') }));

		await expect.poll(() => storage.getLogEntries()).toHaveLength(1);
		const [entry] = await storage.getLogEntries();
		expect(entry).toMatchObject({
			type: 'error',
			message: 'An uncaught error occurred.',
			details: { name: 'TypeError', message: 'Not a function' }
		});
	});

	it('records the message when an error event has no error, as a cross-origin script gives', async () => {
		const storage = new InMemoryStorage();
		useErrorLog(storage);
		const target = new EventTarget();
		installGlobalErrorHandlers(target);

		target.dispatchEvent(new ErrorEvent('error', { message: 'Script error.' }));

		await expect.poll(() => storage.getLogEntries()).toHaveLength(1);
		expect((await storage.getLogEntries())[0]?.details).toEqual({ value: 'Script error.' });
	});

	it('records an unhandled rejection with its reason', async () => {
		const storage = new InMemoryStorage();
		useErrorLog(storage);
		const target = new EventTarget();
		installGlobalErrorHandlers(target);
		const rejected = Promise.reject(new Error('Nobody caught this'));
		rejected.catch(() => {});

		target.dispatchEvent(
			new PromiseRejectionEvent('unhandledrejection', {
				promise: rejected,
				reason: new Error('Nobody caught this')
			})
		);

		await expect.poll(() => storage.getLogEntries()).toHaveLength(1);
		expect((await storage.getLogEntries())[0]).toMatchObject({
			type: 'error',
			message: 'A promise was rejected and nothing handled it.',
			details: { name: 'Error', message: 'Nobody caught this' }
		});
	});

	it('stops recording once it is stopped', async () => {
		const storage = new InMemoryStorage();
		useErrorLog(storage);
		const target = new EventTarget();
		const stop = installGlobalErrorHandlers(target);

		stop();
		target.dispatchEvent(new ErrorEvent('error', { error: new Error('x') }));
		await Promise.resolve();

		expect(await storage.getLogEntries()).toEqual([]);
	});
});
