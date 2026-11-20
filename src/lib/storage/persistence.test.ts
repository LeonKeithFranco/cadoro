import { afterEach, describe, expect, it, vi } from 'vitest';
import { useErrorLog } from '../error-log';
import { recordedErrors } from '../testing/error-log';
import { oneRoundRoutine } from '../testing/routines';
import { savedRunInProgress } from '../testing/run-in-progress';
import { firstWorkPeriod, runInProgress } from '../testing/run-records';
import { storageHolding } from '../testing/storage';
import { fakeStorageManager } from '../testing/storage-manager';
import { InMemoryStorage } from './in-memory-storage';
import {
	askToPersistIfWorkSaved,
	askToPersistOnce,
	isStoragePersistent,
	requestPersistentStorage
} from './persistence';

// Puts back `console.error`, which some tests silence to check what's logged, and takes away the
// log a test chose for errors.
afterEach(() => {
	useErrorLog(null);
	vi.restoreAllMocks();
});

describe('askToPersistOnce', () => {
	it('asks the browser for persistent storage when storage is not persistent yet', async () => {
		const manager = fakeStorageManager(false);

		await askToPersistOnce(manager)();

		expect(manager.persist).toHaveBeenCalledOnce();
	});

	it('does not ask when storage is persistent already', async () => {
		const manager = fakeStorageManager(true);

		await askToPersistOnce(manager)();

		expect(manager.persist).not.toHaveBeenCalled();
	});

	it('asks only the first time, even when called again before the browser answers', async () => {
		const manager = fakeStorageManager(false);
		const askToPersist = askToPersistOnce(manager);

		await Promise.all([askToPersist(), askToPersist()]);
		await askToPersist();

		expect(manager.persisted).toHaveBeenCalledOnce();
		expect(manager.persist).toHaveBeenCalledOnce();
	});

	it('does nothing where the browser has no storage manager', async () => {
		await expect(askToPersistOnce(undefined)()).resolves.toBeUndefined();
	});

	it("records the browser's refused request in the log rather than rejecting", async () => {
		const log = new InMemoryStorage();
		useErrorLog(log);
		const manager = fakeStorageManager(false);
		manager.persist.mockRejectedValueOnce(new Error('The request was blocked.'));

		await expect(askToPersistOnce(manager)()).resolves.toBeUndefined();

		expect(await recordedErrors(log)).toEqual([
			['Persistent storage could not be requested.', 'The request was blocked.']
		]);
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

	it('records storage that cannot be read in the log rather than rejecting', async () => {
		const storage = new InMemoryStorage();
		useErrorLog(storage);
		vi.spyOn(storage, 'hasWorkPeriods').mockRejectedValueOnce(new Error('IndexedDB is blocked.'));
		const askToPersist = vi.fn(async () => {});

		await expect(askToPersistIfWorkSaved(storage, askToPersist)).resolves.toBeUndefined();

		expect(askToPersist).not.toHaveBeenCalled();
		expect(await recordedErrors(storage)).toEqual([
			['Saved work could not be checked for.', 'IndexedDB is blocked.']
		]);
	});
});

describe('isStoragePersistent', () => {
	it('says whether the browser keeps storage persistent', async () => {
		expect(await isStoragePersistent(fakeStorageManager(true))).toBe(true);
		expect(await isStoragePersistent(fakeStorageManager(false))).toBe(false);
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
		const manager = fakeStorageManager(false);

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
