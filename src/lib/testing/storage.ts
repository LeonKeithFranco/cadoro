// Storage for tests that save runs, which storage only accepts for a routine it holds.

import type { Routine } from '../routine';
import { InMemoryStorage } from '../storage/in-memory-storage';
import type { CadoroStorage, StorageOptions } from '../storage/storage';

/**
 * Adds the routines a test's runs belong to, to storage made another way, such as a Dexie
 * backend, which can't be filled before it's returned.
 *
 * @typeParam T - The kind of storage, which the result keeps, so a test can still use what only
 * that backend has.
 * @param storage - Storage that holds no routine.
 * @param routines - The routines to hold, in the order they should be listed.
 * @returns The same storage, now holding exactly `routines`.
 */
export async function withRoutines<T extends CadoroStorage>(
	storage: T,
	routines: readonly Routine[]
): Promise<T> {
	await storage.addRoutinesIfNone([...routines]);
	return storage;
}

/**
 * Makes in-memory storage that already holds the routines a test's runs belong to.
 *
 * @remarks
 * Storage refuses to save a new run whose routine it doesn't hold, as the app's storage always
 * holds at least one routine, so a test that saves runs starts from storage like this rather than
 * from an empty one. The routines are added before this returns, since `InMemoryStorage` saves
 * in the same tick it's called in, with no `await` before the change.
 *
 * @param routines - The routines to hold, in the order they should be listed.
 * @param options - The clock and the log's size, as for `new InMemoryStorage`.
 * @returns New storage holding exactly `routines`.
 */
export function storageHolding(
	routines: readonly Routine[],
	options: StorageOptions = {}
): InMemoryStorage {
	const storage = new InMemoryStorage(options);
	void storage.addRoutinesIfNone([...routines]);
	return storage;
}
