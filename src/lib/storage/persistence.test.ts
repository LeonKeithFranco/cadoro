import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import { useErrorLog } from '../error-log';
import { oneRoundRoutine } from '../testing/routines';
import { savedRunInProgress } from '../testing/run-in-progress';
import { firstWorkPeriod, runInProgress } from '../testing/run-records';
import { storageHolding } from '../testing/storage';
import { InMemoryStorage } from './in-memory-storage';
import {
	askToPersistIfWorkSaved,
	askToPersistOnce,
	isStoragePersistent,
	requestPersistentStorage
} from './persistence';

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

// Puts back `console.error`, which some tests silence to check what's logged, and takes away the
// log a test chose for errors.
afterEach(() => {
	useErrorLog(null);
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

	it('records a refused request in the activity log', async () => {
		const log = new InMemoryStorage();
		useErrorLog(log);
		const manager = fakeManager(false);
		manager.persist.mockRejectedValueOnce(new Error('The request was blocked.'));

		await askToPersistOnce(manager)();

		expect((await log.getLogEntries())[0]).toMatchObject({
			type: 'error',
			message: 'Persistent storage could not be requested.',
			details: { message: 'The request was blocked.' }
		});
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
		const storage = storageHolding([oneRoundRoutine]);
		await storage.saveRunInProgress(savedRunInProgress, null, {
			run: runInProgress,
			workPeriods: [firstWorkPeriod]
		});
		const askToPersist = vi.fn(async () => {});

		await askToPersistIfWorkSaved(storage, askToPersist);

		expect(askToPersist).toHaveBeenCalledOnce();
	});

	it('does not ask on an empty first visit, or while only a run is saved', async () => {
		const storage = storageHolding([oneRoundRoutine]);
		const askToPersist = vi.fn(async () => {});

		await askToPersistIfWorkSaved(storage, askToPersist);
		await storage.saveRunInProgress(savedRunInProgress, null, {
			run: runInProgress,
			workPeriods: []
		});
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

	it('records storage that cannot be read in the activity log', async () => {
		const storage = new InMemoryStorage();
		useErrorLog(storage);
		vi.spyOn(storage, 'hasWorkPeriods').mockRejectedValueOnce(new Error('IndexedDB is blocked.'));

		await askToPersistIfWorkSaved(
			storage,
			vi.fn(async () => {})
		);

		expect((await storage.getLogEntries())[0]).toMatchObject({
			type: 'error',
			message: 'Saved work could not be checked for.',
			details: { message: 'IndexedDB is blocked.' }
		});
	});
});

describe('isStoragePersistent', () => {
	it('says whether the browser keeps storage persistent', async () => {
		expect(await isStoragePersistent(fakeManager(true))).toBe(true);
		expect(await isStoragePersistent(fakeManager(false))).toBe(false);
	});

	it('says it can’t tell where the browser has no storage manager', async () => {
		expect(await isStoragePersistent(undefined)).toBeNull();
	});

	it('records a failed check in the activity log and says it can’t tell, rather than rejecting', async () => {
		const storage = new InMemoryStorage();
		useErrorLog(storage);
		const manager = {
			persisted: vi.fn().mockRejectedValue(new Error('Blocked.')),
			persist: vi.fn()
		};

		expect(await isStoragePersistent(manager)).toBeNull();

		expect(await storage.getLogEntries()).toMatchObject([
			{
				type: 'error',
				message: 'Persistent storage could not be checked.',
				details: { message: 'Blocked.' }
			}
		]);
	});
});

describe('requestPersistentStorage', () => {
	it('asks every time it is called, since the user asked', async () => {
		const manager = fakeManager(false);

		await requestPersistentStorage(manager);
		await requestPersistentStorage(manager);

		expect(manager.persist).toHaveBeenCalledTimes(2);
	});

	it('does nothing where the browser has no storage manager', async () => {
		await expect(requestPersistentStorage(undefined)).resolves.toBeUndefined();
	});

	it('records a failed request in the activity log rather than rejecting', async () => {
		const storage = new InMemoryStorage();
		useErrorLog(storage);
		const manager = {
			persisted: vi.fn(),
			persist: vi.fn().mockRejectedValue(new Error('Blocked.'))
		};

		await expect(requestPersistentStorage(manager)).resolves.toBeUndefined();

		expect(await storage.getLogEntries()).toMatchObject([
			{
				type: 'error',
				message: 'Persistent storage could not be requested.',
				details: { message: 'Blocked.' }
			}
		]);
	});
});
