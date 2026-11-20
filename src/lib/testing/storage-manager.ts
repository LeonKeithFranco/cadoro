// A fake `navigator.storage`, since the real one's answer depends on the browser's own judgement,
// such as whether the app is installed, which a test can't control.

import { vi, type Mock } from 'vitest';
import type { PersistenceManager } from '../storage/persistence';

/** A stand-in for `navigator.storage` that a test controls. */
export type FakeStorageManager = PersistenceManager & {
	/** Whether storage is persistent now, which a granted request turns on. */
	isPersistent: boolean;
	/** Whether the browser grants a request for persistent storage. */
	willGrant: boolean;
	/** Answers whether storage is persistent now. Records its calls. */
	persisted: Mock<() => Promise<boolean>>;
	/** Answers a request for persistent storage, granting it if `willGrant`. Records its calls. */
	persist: Mock<() => Promise<boolean>>;
};

/**
 * Makes a fake storage manager.
 *
 * @param isPersistent - Whether storage is persistent to begin with.
 * @param willGrant - Whether the browser grants a request for persistent storage.
 * @returns The manager, whose fields a test may change and whose methods record their calls, so a
 * test can count the requests or make one reject with `mockRejectedValueOnce`.
 */
export function fakeStorageManager(isPersistent: boolean, willGrant = true): FakeStorageManager {
	const manager: FakeStorageManager = {
		isPersistent,
		willGrant,
		persisted: vi.fn(() => Promise.resolve(manager.isPersistent)),
		persist: vi.fn(() => {
			manager.isPersistent = manager.isPersistent || manager.willGrant;
			return Promise.resolve(manager.isPersistent);
		})
	};
	return manager;
}
