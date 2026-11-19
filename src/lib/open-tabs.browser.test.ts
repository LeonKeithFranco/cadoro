import { afterEach, describe, expect, it, vi } from 'vitest';
import { useErrorLog } from './error-log';
import { joinOpenTabs, OPEN_TAB_LOCK } from './open-tabs';
import { InMemoryStorage } from './storage/in-memory-storage';

/**
 * Makes a lock name no other test uses, since a lock this page takes lasts as long as the page,
 * which runs every test in this file.
 *
 * @returns A name starting `test-`, then a UUID.
 */
function newLockName(): string {
	return `test-${crypto.randomUUID()}`;
}

/**
 * Makes a lock manager that refuses, as a browser can, for the failures a test can't cause with
 * the real one.
 *
 * @param failure - The error it refuses with.
 * @param refuses - Which call refuses: `query`, or `request` after a `query` that finds no lock.
 * @returns A lock manager whose chosen call rejects with `failure`.
 */
function refusingLocks(failure: Error, refuses: 'query' | 'request'): LockManager {
	return {
		query: async (): Promise<LockManagerSnapshot> => {
			if (refuses === 'query') {
				throw failure;
			}
			return { held: [], pending: [] };
		},
		request: async (): Promise<never> => {
			throw failure;
		}
	};
}

describe('joinOpenTabs', () => {
	// Puts back `console.error`, which the failure tests silence, and takes away the log a test
	// chose for errors.
	afterEach(() => {
		useErrorLog(null);
		vi.restoreAllMocks();
	});

	it('says no other tab is open when none holds the lock', async () => {
		expect(await joinOpenTabs(navigator.locks, newLockName())).toBe(false);
	});

	it('says another tab is open once one has joined, as the browser shares locks across tabs', async () => {
		const name = newLockName();
		await joinOpenTabs(navigator.locks, name);

		expect(await joinOpenTabs(navigator.locks, name)).toBe(true);
	});

	it('holds a shared lock once it has said, so tabs opening later can tell', async () => {
		const name = newLockName();

		await joinOpenTabs(navigator.locks, name);

		const { held = [] } = await navigator.locks.query();
		expect(held.filter((lock) => lock.name === name)).toEqual([
			expect.objectContaining({ name, mode: 'shared' })
		]);
	});

	it('holds the lock named cadoro-open-tab unless told another', async () => {
		await joinOpenTabs(navigator.locks);

		const { held = [] } = await navigator.locks.query();
		expect(OPEN_TAB_LOCK).toBe('cadoro-open-tab');
		expect(held.map((lock) => lock.name)).toContain('cadoro-open-tab');
	});

	it('says none is open where the browser has no Web Locks API, as outside HTTPS', async () => {
		expect(await joinOpenTabs(undefined, newLockName())).toBe(false);
	});

	it('logs a refused check and says none is open, so the run is restored paused', async () => {
		const failure = new Error('Locks are blocked.');
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

		const isAnotherTabOpen = await joinOpenTabs(refusingLocks(failure, 'query'), newLockName());

		expect(isAnotherTabOpen).toBe(false);
		expect(consoleError).toHaveBeenCalledWith(
			'Could not tell whether the app is open in another tab.',
			failure
		);
	});

	it('records a refused check, and a refused lock, in the activity log', async () => {
		const log = new InMemoryStorage();
		useErrorLog(log);

		await joinOpenTabs(refusingLocks(new Error('Query blocked.'), 'query'), newLockName());
		await joinOpenTabs(refusingLocks(new Error('Request blocked.'), 'request'), newLockName());

		const entries = await log.getLogEntries();
		expect(entries.map((entry) => [entry.type, entry.message, entry.details?.['message']])).toEqual(
			[
				['error', 'Could not tell whether the app is open in another tab.', 'Request blocked.'],
				['error', 'Could not tell whether the app is open in another tab.', 'Query blocked.']
			]
		);
	});

	it('still says another tab is open when it finds one but its own lock is refused', async () => {
		const failure = new Error('Locks are blocked.');
		const name = newLockName();
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const locks: LockManager = {
			query: async (): Promise<LockManagerSnapshot> => ({
				held: [{ name, mode: 'shared', clientId: 'another-tab' }],
				pending: []
			}),
			request: async (): Promise<never> => {
				throw failure;
			}
		};

		expect(await joinOpenTabs(locks, name)).toBe(true);
	});

	it('logs a refused lock and says none is open, rather than waiting for it', async () => {
		const failure = new Error('Locks are blocked.');
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

		const isAnotherTabOpen = await joinOpenTabs(refusingLocks(failure, 'request'), newLockName());

		expect(isAnotherTabOpen).toBe(false);
		expect(consoleError).toHaveBeenCalledWith(
			'Could not tell whether the app is open in another tab.',
			failure
		);
	});
});
