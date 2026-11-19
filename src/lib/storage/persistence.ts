// Asking the browser for persistent storage, so a browser low on space doesn't delete the app's
// data without asking. It asks once work is saved, and never on an empty first visit, because
// Firefox shows the user a prompt for it.

import type { CadoroStorage } from './storage';

/** The parts of the browser's `StorageManager`, `navigator.storage`, that asking needs. */
export type PersistenceManager = Pick<StorageManager, 'persisted' | 'persist'>;

/**
 * Makes a function that asks the browser for persistent storage the first time it's called, and
 * does nothing after that.
 *
 * @remarks
 * It asks at most once each time the app opens, however many work periods are saved, so Firefox's
 * prompt can't show after every Next. It checks `persisted()` first, and asks only when storage
 * isn't persistent yet. The browser can refuse, and the app works the same either way.
 *
 * @param manager - The browser's storage manager, `navigator.storage`, or `undefined` where the
 * browser doesn't have one, as on a page served without HTTPS.
 * @returns A function that asks, once, and resolves when the browser has answered. It never
 * rejects: an error from the browser is logged, and still counts as the one time.
 */
export function askToPersistOnce(manager: PersistenceManager | undefined): () => Promise<void> {
	let hasAsked = false;

	return async () => {
		if (hasAsked || manager === undefined) {
			return;
		}
		// Set before the first `await`, so a second call while the browser answers doesn't ask too.
		hasAsked = true;

		try {
			const isPersisted = await manager.persisted();
			if (!isPersisted) {
				await manager.persist();
			}
		} catch (error: unknown) {
			console.error('Persistent storage could not be requested.', error);
		}
	};
}

/**
 * Asks for persistent storage as the app opens, if work is already saved, as on every launch
 * after the first work period.
 *
 * @param storage - Where the work periods are kept.
 * @param askToPersist - Asks the browser, as {@link askToPersistOnce} makes it.
 * @returns A promise that resolves once storage has been checked and, if work is saved, the
 * browser has answered. It never rejects: storage that can't be read is logged.
 */
export async function askToPersistIfWorkSaved(
	storage: CadoroStorage,
	askToPersist: () => Promise<void>
): Promise<void> {
	try {
		if (await storage.hasWorkPeriods()) {
			await askToPersist();
		}
	} catch (error: unknown) {
		console.error('Saved work could not be checked for.', error);
	}
}

/**
 * Finds out whether the browser keeps the app's storage persistent, for Settings to show.
 *
 * @param manager - The browser's storage manager, or `undefined` where there's none.
 * @returns A promise of `true` when storage is persistent and `false` when it isn't, or of `null`
 * when the browser can't say: there's no storage manager, or asking failed, which is logged. It
 * never rejects.
 */
export async function isStoragePersistent(
	manager: PersistenceManager | undefined
): Promise<boolean | null> {
	if (manager === undefined) {
		return null;
	}
	try {
		return await manager.persisted();
	} catch (error: unknown) {
		console.error('Persistent storage could not be checked.', error);
		return null;
	}
}

/**
 * Asks the browser for persistent storage again, as Settings' button does, whatever was asked
 * before.
 *
 * @remarks
 * Unlike {@link askToPersistOnce}, it asks every time it's called, since the user asked. The
 * browser decides, and the answer is read back with {@link isStoragePersistent}.
 *
 * @param manager - The browser's storage manager, or `undefined` where there's none.
 * @returns A promise that settles once the browser has answered. It never rejects: an error from
 * the browser is logged.
 */
export async function requestPersistentStorage(
	manager: PersistenceManager | undefined
): Promise<void> {
	if (manager === undefined) {
		return;
	}
	try {
		await manager.persist();
	} catch (error: unknown) {
		console.error('Persistent storage could not be requested.', error);
	}
}
