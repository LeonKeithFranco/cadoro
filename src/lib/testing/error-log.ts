// Reading the errors a test recorded in the activity log.

import type { CadoroStorage } from '../storage/storage';

/**
 * Reads the error entries recorded in storage so far, for tests that chose it with `useErrorLog`.
 *
 * @param storage - The storage the errors were recorded in.
 * @returns For each `error` entry, newest first, its message and the message of the error it
 * holds, or `undefined` when the thrown value wasn't an `Error`. `change` entries are left out.
 */
export async function recordedErrors(storage: CadoroStorage): Promise<[string, unknown][]> {
	const entries = await storage.getLogEntries();
	return entries
		.filter((entry) => entry.type === 'error')
		.map((entry) => [entry.message, entry.details?.['message']]);
}
