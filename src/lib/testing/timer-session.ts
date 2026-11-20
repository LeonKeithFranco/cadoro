// The options a test gives a TimerSession, which the session tests, the screen tests and the
// tests of what follows the session all build the same way.

import { vi } from 'vitest';
import type { TimerSessionOptions } from '../timer.svelte';
import { numberedIds } from './ids';

/**
 * Makes the revisions of every session built by {@link testSessionOptions}, so two sessions on one
 * storage, as two tabs, never make the same one, as `crypto.randomUUID` never does.
 */
let newRevision = numberedIds('revision');

/**
 * Numbers the revisions from `revision-1` again, so a test that checks a saved revision doesn't
 * depend on the tests before it. Call it in a `beforeEach`.
 */
export function restartRevisions(): void {
	newRevision = numberedIds('revision');
}

/**
 * Makes the options for a `TimerSession` on a fake clock.
 *
 * @remarks
 * Unless `overrides` say otherwise, ids are numbered from `id-1` for each call, revisions are
 * numbered across every call since {@link restartRevisions}, and `onWorkSaved` is a spy nothing
 * checks. A test with two tabs on one storage gives each its own `newId`.
 *
 * @param clock - Returns the fake clock's current moment, in milliseconds since 1970.
 * @param storage - Where the session saves.
 * @param overrides - The options a test sets itself, such as `newId`, `onPress` or `onWorkSaved`.
 * @returns The options for a new session.
 */
export function testSessionOptions(
	clock: () => number,
	storage: TimerSessionOptions['storage'],
	overrides: Partial<TimerSessionOptions> = {}
): TimerSessionOptions {
	return {
		clock,
		storage,
		newId: numberedIds(),
		newRevision,
		onWorkSaved: vi.fn(),
		...overrides
	};
}
