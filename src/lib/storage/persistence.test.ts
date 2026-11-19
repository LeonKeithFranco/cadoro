import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import { firstWorkPeriod, runInProgress } from '../testing/run-records';
import { InMemoryStorage } from './in-memory-storage';
import { askToPersistIfWorkSaved, askToPersistOnce } from './persistence';

/**
 * A stand-in for `navigator.storage`. The real one's answer depends on the browser's own
 * judgement, such as whether the app is installed, which a test can't control.
 */
type FakeManager = {
	/** Answers whether storage is persistent already. */
	persisted: Mock<() => Promise<boolean>>;
	/** Answers the request for persistent storage, granting it. */
	persist: Mock<() => Promise<boolean>>;
};

/**
 * Makes a fake storage manager.
 *
 * @param isPersisted - What `persisted()` answers: whether storage is persistent already.
 * @returns The fake, whose methods record their calls.
 */
function fakeManager(isPersisted: boolean): FakeManager {
	return {
		persisted: vi.fn(async () => isPersisted),
		persist: vi.fn(async () => true)
	};
}

// Puts back `console.error`, which some tests silence to check what's logged.
afterEach(() => {
	vi.restoreAllMocks();
});

describe('askToPersistOnce', () => {
	it('asks the browser for persistent storage when storage is not persistent yet', async () => {
		const manager = fakeManager(false);

		await askToPersistOnce(manager)();

		expect(manager.persist).toHaveBeenCalledOnce();
	});

	it('does not ask when storage is persistent already', async () => {
		const manager = fakeManager(true);

		await askToPersistOnce(manager)();

		expect(manager.persist).not.toHaveBeenCalled();
	});

	it('asks only the first time, even when called again before the browser answers', async () => {
		const manager = fakeManager(false);
		const askToPersist = askToPersistOnce(manager);

		await Promise.all([askToPersist(), askToPersist()]);
		await askToPersist();

		expect(manager.persisted).toHaveBeenCalledOnce();
		expect(manager.persist).toHaveBeenCalledOnce();
	});

	it('does nothing where the browser has no storage manager', async () => {
		await expect(askToPersistOnce(undefined)()).resolves.toBeUndefined();
	});

	it("logs the browser's error rather than rejecting", async () => {
		const manager = fakeManager(false);
		const failure = new Error('The request was blocked.');
		manager.persist.mockRejectedValueOnce(failure);
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

		await expect(askToPersistOnce(manager)()).resolves.toBeUndefined();

		expect(consoleError).toHaveBeenCalledWith(
			'Persistent storage could not be requested.',
			failure
		);
	});
});

describe('askToPersistIfWorkSaved', () => {
	it('asks when a work period is saved, as on a launch after the first work', async () => {
		const storage = new InMemoryStorage();
		await storage.saveRunRecords({ run: runInProgress, workPeriods: [firstWorkPeriod] });
		const askToPersist = vi.fn(async () => {});

		await askToPersistIfWorkSaved(storage, askToPersist);

		expect(askToPersist).toHaveBeenCalledOnce();
	});

	it('does not ask on an empty first visit, or while only a run is saved', async () => {
		const storage = new InMemoryStorage();
		const askToPersist = vi.fn(async () => {});

		await askToPersistIfWorkSaved(storage, askToPersist);
		await storage.saveRunRecords({ run: runInProgress, workPeriods: [] });
		await askToPersistIfWorkSaved(storage, askToPersist);

		expect(askToPersist).not.toHaveBeenCalled();
	});

	it('logs storage that cannot be read rather than rejecting', async () => {
		const storage = new InMemoryStorage();
		const failure = new Error('IndexedDB is blocked.');
		vi.spyOn(storage, 'hasWorkPeriods').mockRejectedValueOnce(failure);
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		const askToPersist = vi.fn(async () => {});

		await expect(askToPersistIfWorkSaved(storage, askToPersist)).resolves.toBeUndefined();

		expect(askToPersist).not.toHaveBeenCalled();
		expect(consoleError).toHaveBeenCalledWith('Saved work could not be checked for.', failure);
	});
});
