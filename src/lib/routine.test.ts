import { describe, expect, it } from 'vitest';
import { createStarterRoutines, pickableRoutines } from './routine';
import { routineWith } from './testing/routines';

/** The moment every test creates the routines at. */
const now = new Date('2026-01-05T09:00:00.000Z');

/**
 * Makes an id generator that counts up, so tests can predict every id.
 *
 * @returns A generator giving `id-1`, then `id-2`, and so on.
 */
function countingIds(): () => string {
	let count = 0;
	return (): string => `id-${++count}`;
}

describe('pickableRoutines', () => {
	it('lists the routines lowest custom position first', () => {
		const routines = [
			routineWith({ id: 'third', customPosition: 2 }),
			routineWith({ id: 'first', customPosition: 0 }),
			routineWith({ id: 'second', customPosition: 1 })
		];

		const ids = pickableRoutines(routines).map((routine) => routine.id);

		expect(ids).toEqual(['first', 'second', 'third']);
	});

	it('leaves out deleted routines', () => {
		const routines = [
			routineWith({ id: 'deleted', customPosition: 0, deletedAt: '2026-01-05T09:00:00.000Z' }),
			routineWith({ id: 'kept', customPosition: 1 })
		];

		const ids = pickableRoutines(routines).map((routine) => routine.id);

		expect(ids).toEqual(['kept']);
	});

	it('leaves the given list in its own order', () => {
		const routines = [
			routineWith({ id: 'second', customPosition: 1 }),
			routineWith({ id: 'first', customPosition: 0 })
		];

		pickableRoutines(routines);

		expect(routines.map((routine) => routine.id)).toEqual(['second', 'first']);
	});
});

describe('createStarterRoutines', () => {
	it('creates Classic, then Classic with long break, in that custom order', () => {
		const routines = createStarterRoutines(now, countingIds());

		expect(routines.map((routine) => [routine.title, routine.customPosition])).toEqual([
			['Classic', 0],
			['Classic with long break', 1]
		]);
	});

	it('gives Classic one block of 25 minutes at 20% for 1 cycle, repeating forever', () => {
		const [classic] = createStarterRoutines(now, countingIds());

		expect(classic).toMatchObject({
			rounds: 'infinite',
			blocks: [{ title: 'Focus', targetMinutes: 25, breakPercent: 20, cycles: 1 }]
		});
	});

	it('gives Classic with long break three cycles at 20%, then one at 60%, repeating forever', () => {
		const [, withLongBreak] = createStarterRoutines(now, countingIds());

		expect(withLongBreak).toMatchObject({
			rounds: 'infinite',
			blocks: [
				{ title: 'Focus', targetMinutes: 25, breakPercent: 20, cycles: 3 },
				{ title: 'Long break', targetMinutes: 25, breakPercent: 60, cycles: 1 }
			]
		});
	});

	it('takes a different id from the generator for every routine and block', () => {
		const routines = createStarterRoutines(now, countingIds());
		const ids = routines.flatMap((routine) => [
			routine.id,
			...routine.blocks.map((block) => block.id)
		]);

		expect(new Set(ids)).toEqual(new Set(['id-1', 'id-2', 'id-3', 'id-4', 'id-5']));
	});

	it('stamps every routine with the given time in UTC, and none as deleted', () => {
		const routines = createStarterRoutines(now, countingIds());

		for (const routine of routines) {
			expect(routine.createdAt).toBe('2026-01-05T09:00:00.000Z');
			expect(routine.deletedAt).toBeNull();
		}
	});

	it('creates new blocks every time, so changing one set leaves the next untouched', () => {
		const first = createStarterRoutines(now, countingIds());
		first[0].blocks[0].targetMinutes = 50;

		const second = createStarterRoutines(now, countingIds());

		expect(second[0].blocks[0].targetMinutes).toBe(25);
	});
});
