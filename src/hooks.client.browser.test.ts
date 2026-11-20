import type { NavigationEvent } from '@sveltejs/kit';
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { useErrorLog } from '#lib/error-log.ts';
import { InMemoryStorage } from '#lib/storage/in-memory-storage.ts';
import { recordedErrors } from '#lib/testing/error-log.ts';
import { handleError, init } from './hooks.client';

// Takes the log away again and puts back what a test spied on.
afterEach(() => {
	useErrorLog(null);
	vi.restoreAllMocks();
});

/** The navigation the hook is told about, which it doesn't read. */
const event = {} as NavigationEvent;

describe('handleError', () => {
	it('records an unknown error thrown while loading', async () => {
		const storage = new InMemoryStorage();
		useErrorLog(storage);

		await handleError({ kind: 'unknown', error: new Error('Load failed'), event });

		await expect.poll(() => storage.getLogEntries()).toHaveLength(1);
		expect((await storage.getLogEntries())[0]).toMatchObject({
			type: 'error',
			message: 'An error was thrown while loading or navigating.',
			details: { name: 'Error', message: 'Load failed' }
		});
	});

	it('records an error SvelteKit raised other than a 404', async () => {
		const storage = new InMemoryStorage();
		useErrorLog(storage);

		await handleError({
			kind: 'framework',
			error: { status: 500, message: 'Internal Error' },
			event
		});

		await expect.poll(() => storage.getLogEntries()).toHaveLength(1);
	});

	it('does not record a 404, which is an address no screen has and not an error of the app', async () => {
		const storage = new InMemoryStorage();
		useErrorLog(storage);

		await handleError({ kind: 'framework', error: { status: 404, message: 'Not Found' }, event });
		await Promise.resolve();

		expect(await storage.getLogEntries()).toEqual([]);
	});

	it('returns nothing, so SvelteKit keeps its default error page', async () => {
		useErrorLog(new InMemoryStorage());

		expect(await handleError({ kind: 'unknown', error: new Error('x'), event })).toBeUndefined();
	});
});

describe('init', () => {
	/**
	 * Starts the hook's listeners on the window, and removes them when the test is over, since
	 * `init` gives no way to stop them and they would record into later tests' logs.
	 *
	 * @returns A promise that settles once `init` has run.
	 */
	async function initWithCleanup(): Promise<void> {
		const listening = vi.spyOn(window, 'addEventListener');
		await init();
		onTestFinished(() => {
			for (const [type, listener] of listening.mock.calls) {
				window.removeEventListener(type, listener);
			}
		});
	}

	it('records an uncaught error on the window in the activity log', async () => {
		const storage = new InMemoryStorage();
		useErrorLog(storage);
		await initWithCleanup();

		// Marks the error as handled for the browser. Vite's forwarded console still prints it as
		// "[Unhandled error]", which the test can't prevent, since it listens before this test does.
		window.addEventListener('error', (caught) => caught.preventDefault(), { once: true });
		window.dispatchEvent(new ErrorEvent('error', { error: new TypeError('Not a function') }));

		await expect
			.poll(() => recordedErrors(storage))
			.toEqual([['An uncaught error occurred.', 'Not a function']]);
	});

	it('records an unhandled rejection on the window in the activity log', async () => {
		const storage = new InMemoryStorage();
		useErrorLog(storage);
		await initWithCleanup();
		const reason = new Error('Nobody caught this');
		// Handled here, so the browser never sees a rejection that nothing caught.
		const rejected = Promise.reject(reason);
		rejected.catch(() => {});
		// Marks the event as handled for the test runner's own listener.
		window.addEventListener('unhandledrejection', (caught) => caught.preventDefault(), {
			once: true
		});

		window.dispatchEvent(
			new PromiseRejectionEvent('unhandledrejection', { promise: rejected, reason })
		);

		await expect
			.poll(() => recordedErrors(storage))
			.toEqual([['A promise was rejected and nothing handled it.', 'Nobody caught this']]);
	});
});
