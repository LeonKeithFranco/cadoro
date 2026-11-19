import { describe, expect, it } from 'vitest';
import { routineWith } from '../testing/routines';
import { InMemoryStorage } from './in-memory-storage';
import type { CadoroStorage } from './storage';

/** A backend the shared suite checks. */
type Backend = {
	/** The backend's class name, which names its group of tests. */
	name: string;
	/** Makes a new, empty storage, so no test sees another's data. */
	create: () => CadoroStorage;
};

/** Every backend, each checked against the same tests, so they all keep the same contract. */
const backends: Backend[] = [{ name: 'InMemoryStorage', create: () => new InMemoryStorage() }];

describe.each(backends)('$name', ({ create }) => {
	describe('getRoutines', () => {
		it('returns nothing from empty storage', async () => {
			const storage = create();

			expect(await storage.getRoutines()).toEqual([]);
		});

		it('returns the routines in custom order, whatever order they were added in', async () => {
			const storage = create();
			await storage.addRoutinesIfNone([
				routineWith({ id: 'third', customPosition: 2 }),
				routineWith({ id: 'first', customPosition: 0 }),
				routineWith({ id: 'second', customPosition: 1 })
			]);

			const routines = await storage.getRoutines();

			expect(routines.map((routine) => routine.id)).toEqual(['first', 'second', 'third']);
		});

		it('leaves out deleted routines', async () => {
			const storage = create();
			await storage.addRoutinesIfNone([
				routineWith({ id: 'kept', customPosition: 0 }),
				routineWith({ id: 'deleted', customPosition: 1, deletedAt: '2026-01-05T09:00:00.000Z' })
			]);

			const routines = await storage.getRoutines();

			expect(routines.map((routine) => routine.id)).toEqual(['kept']);
		});

		it('returns copies, so changing one leaves the saved routine unchanged', async () => {
			const storage = create();
			await storage.addRoutinesIfNone([routineWith({ title: 'Writing' })]);
			const [read] = await storage.getRoutines();
			read.title = 'Changed';
			read.blocks[0].targetMinutes = 50;

			const [readAgain] = await storage.getRoutines();

			expect(readAgain.title).toBe('Writing');
			expect(readAgain.blocks[0].targetMinutes).toBe(25);
		});
	});

	describe('addRoutinesIfNone', () => {
		it('saves every field of the routines into empty storage, and says it did', async () => {
			const storage = create();
			const routine = routineWith({
				id: 'writing',
				title: 'Writing',
				rounds: 'infinite',
				blocks: [
					{ id: 'draft', title: 'Draft', targetMinutes: 50, breakPercent: 20, cycles: 2 },
					{ id: 'edit', title: 'Edit', targetMinutes: 30, breakPercent: 10, cycles: 1 }
				],
				customPosition: 0,
				createdAt: '2026-01-05T09:00:00.000Z'
			});

			const added = await storage.addRoutinesIfNone([routine]);

			expect(added).toBe(true);
			expect(await storage.getRoutines()).toEqual([routine]);
		});

		it('refuses when storage holds routines, and keeps the ones it has', async () => {
			const storage = create();
			await storage.addRoutinesIfNone([routineWith({ id: 'existing' })]);

			const added = await storage.addRoutinesIfNone([routineWith({ id: 'new' })]);

			expect(added).toBe(false);
			const routines = await storage.getRoutines();
			expect(routines.map((routine) => routine.id)).toEqual(['existing']);
		});

		it('refuses when the only routine is deleted, so deleted starters never come back', async () => {
			const storage = create();
			await storage.addRoutinesIfNone([
				routineWith({ id: 'deleted', deletedAt: '2026-01-05T09:00:00.000Z' })
			]);

			const added = await storage.addRoutinesIfNone([routineWith({ id: 'new' })]);

			expect(added).toBe(false);
			expect(await storage.getRoutines()).toEqual([]);
		});

		it('saves copies, so changing a routine after adding it leaves the saved one unchanged', async () => {
			const storage = create();
			const routine = routineWith({ title: 'Writing' });
			await storage.addRoutinesIfNone([routine]);
			routine.title = 'Changed';

			const [saved] = await storage.getRoutines();

			expect(saved.title).toBe('Writing');
		});
	});
});
