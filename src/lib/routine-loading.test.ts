import { describe, expect, it } from 'vitest';
import { loadRoutines } from './routine-loading';
import { InMemoryStorage } from './storage/in-memory-storage';
import { numberedIds } from './testing/ids';
import { routineWith } from './testing/routines';

/** The moment the first launch happens in every test. */
const firstLaunch = new Date('2026-01-05T09:00:00.000Z');

/** A later moment, for opening the app again. */
const laterLaunch = new Date('2026-01-06T09:00:00.000Z');

describe('loadRoutines', () => {
	it('creates the starter routines on the first launch, and returns them', async () => {
		const routines = await loadRoutines(new InMemoryStorage(), firstLaunch, numberedIds());

		expect(routines.map((routine) => routine.title)).toEqual([
			'Classic',
			'Classic with long break'
		]);
		expect(routines[0].createdAt).toBe('2026-01-05T09:00:00.000Z');
	});

	it('keeps the same routines, ids and creation times when the app opens again', async () => {
		const storage = new InMemoryStorage();
		const first = await loadRoutines(storage, firstLaunch, numberedIds());

		// Ids that differ from the first launch's, so new starters would show.
		const otherIds = (): string => `other-${crypto.randomUUID()}`;
		const second = await loadRoutines(storage, laterLaunch, otherIds);

		expect(second).toEqual(first);
	});

	it('leaves the routines storage holds alone, adding no starters', async () => {
		const storage = new InMemoryStorage();
		await storage.addRoutinesIfNone([routineWith({ id: 'mine', title: 'Writing' })]);

		const routines = await loadRoutines(storage, firstLaunch, numberedIds());

		expect(routines.map((routine) => routine.title)).toEqual(['Writing']);
	});
});
