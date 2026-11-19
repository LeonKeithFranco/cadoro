// Reading the routines when the app opens, creating the starter routines on the first launch.

import { createStarterRoutines, type Routine } from './routine';
import type { CadoroStorage } from './storage/storage';

/**
 * Reads the routines to pick from, first creating the starter routines if storage holds no
 * routine at all, as on the first launch.
 *
 * @remarks
 * Storage decides whether to add the starters, in one step, so two tabs opening at once add them
 * once. The starters are made on every call and thrown away when storage holds routines already.
 *
 * @param storage - Where the routines are kept.
 * @param now - The moment the app opened, which starter routines are stamped with if they're
 * created.
 * @param newId - Returns a new unique id each time it's called, such as `crypto.randomUUID`.
 * @returns The routines not deleted, in custom order.
 * @throws Rejects with storage's own error when the routines can't be read or saved.
 */
export async function loadRoutines(
	storage: CadoroStorage,
	now: Date,
	newId: () => string
): Promise<Routine[]> {
	await storage.addRoutinesIfNone(createStarterRoutines(now, newId));
	return storage.getRoutines();
}
