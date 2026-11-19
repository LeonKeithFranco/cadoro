import type { NavigationEvent } from '@sveltejs/kit';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useErrorLog } from '#lib/error-log.ts';
import { InMemoryStorage } from '#lib/storage/in-memory-storage.ts';
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
	it('starts listening for uncaught errors and unhandled rejections on the window', async () => {
		const listening = vi.spyOn(window, 'addEventListener');

		await init();

		expect(listening).toHaveBeenCalledWith('error', expect.any(Function));
		expect(listening).toHaveBeenCalledWith('unhandledrejection', expect.any(Function));
	});
});
