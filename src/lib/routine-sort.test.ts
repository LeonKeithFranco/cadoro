import { describe, expect, it } from 'vitest';
import type { Routine } from './routine';
import { sortRoutines, type RoutineSort, type RoutineUsage } from './routine-sort';
import { minutes } from './testing/durations';
import { routineWith } from './testing/routines';
import { runWith, workPeriodWith } from './testing/run-records';

/** No runs or work periods, for the orders that don't read them. */
const noUsage: RoutineUsage = { runs: [], workPeriods: [] };

/**
 * Sorts routines and lists their ids.
 *
 * @param routines - The routines to sort.
 * @param sort - The order.
 * @param usage - The runs and work periods.
 * @returns The ids of the sorted routines, in order.
 */
function sortedIds(
	routines: Routine[],
	sort: RoutineSort,
	usage: RoutineUsage = noUsage
): string[] {
	return sortRoutines(routines, sort, usage).map((routine) => routine.id);
}

describe('sortRoutines', () => {
	it('sorts by custom position', () => {
		const routines = [
			routineWith({ id: 'b', customPosition: 1 }),
			routineWith({ id: 'c', customPosition: 2 }),
			routineWith({ id: 'a', customPosition: 0 })
		];

		expect(sortedIds(routines, 'custom')).toEqual(['a', 'b', 'c']);
	});

	it('sorts by title from A to Z, ignoring case', () => {
		const routines = [
			routineWith({ id: 'cat', title: 'cat', customPosition: 0 }),
			routineWith({ id: 'bee', title: 'Bee', customPosition: 1 }),
			routineWith({ id: 'ant', title: 'ANT', customPosition: 2 })
		];

		expect(sortedIds(routines, 'title-asc')).toEqual(['ant', 'bee', 'cat']);
	});

	it('sorts by title ignoring accents, so Éclair sits with the E titles', () => {
		const routines = [
			routineWith({ id: 'zebra', title: 'Zebra', customPosition: 0 }),
			routineWith({ id: 'eclair', title: 'Éclair', customPosition: 1 }),
			routineWith({ id: 'egg', title: 'Egg', customPosition: 2 }),
			routineWith({ id: 'dog', title: 'Dog', customPosition: 3 })
		];

		expect(sortedIds(routines, 'title-asc')).toEqual(['dog', 'eclair', 'egg', 'zebra']);
	});

	it('sorts by title from Z to A', () => {
		const routines = [
			routineWith({ id: 'ant', title: 'ANT', customPosition: 0 }),
			routineWith({ id: 'cat', title: 'cat', customPosition: 1 }),
			routineWith({ id: 'bee', title: 'Bee', customPosition: 2 })
		];

		expect(sortedIds(routines, 'title-desc')).toEqual(['cat', 'bee', 'ant']);
	});

	it('keeps custom order between routines with the same title', () => {
		const routines = [
			routineWith({ id: 'second', title: 'Same', customPosition: 1 }),
			routineWith({ id: 'first', title: 'same', customPosition: 0 })
		];

		expect(sortedIds(routines, 'title-asc')).toEqual(['first', 'second']);
		expect(sortedIds(routines, 'title-desc')).toEqual(['first', 'second']);
	});

	it('sorts newest first', () => {
		const routines = [
			routineWith({ id: 'middle', createdAt: '2026-02-01T00:00:00.000Z', customPosition: 0 }),
			routineWith({ id: 'newest', createdAt: '2026-03-01T00:00:00.000Z', customPosition: 1 }),
			routineWith({ id: 'oldest', createdAt: '2026-01-01T00:00:00.000Z', customPosition: 2 })
		];

		expect(sortedIds(routines, 'newest')).toEqual(['newest', 'middle', 'oldest']);
	});

	it('sorts oldest first', () => {
		const routines = [
			routineWith({ id: 'middle', createdAt: '2026-02-01T00:00:00.000Z', customPosition: 0 }),
			routineWith({ id: 'newest', createdAt: '2026-03-01T00:00:00.000Z', customPosition: 1 }),
			routineWith({ id: 'oldest', createdAt: '2026-01-01T00:00:00.000Z', customPosition: 2 })
		];

		expect(sortedIds(routines, 'oldest')).toEqual(['oldest', 'middle', 'newest']);
	});

	it('keeps custom order between routines made at the same moment', () => {
		const routines = [
			routineWith({ id: 'second', customPosition: 1 }),
			routineWith({ id: 'first', customPosition: 0 })
		];

		expect(sortedIds(routines, 'newest')).toEqual(['first', 'second']);
		expect(sortedIds(routines, 'oldest')).toEqual(['first', 'second']);
	});

	describe('last used', () => {
		it('puts the routine with the latest run start first, using each routine latest run', () => {
			const routines = [
				routineWith({ id: 'a', customPosition: 0 }),
				routineWith({ id: 'b', customPosition: 1 }),
				routineWith({ id: 'c', customPosition: 2 })
			];
			const runs = [
				runWith({ id: 'run-1', routineId: 'a', startedAt: '2026-11-03T09:00:00.000Z' }),
				runWith({ id: 'run-2', routineId: 'b', startedAt: '2026-11-01T09:00:00.000Z' }),
				runWith({ id: 'run-3', routineId: 'c', startedAt: '2026-11-02T09:00:00.000Z' }),
				runWith({ id: 'run-4', routineId: 'b', startedAt: '2026-11-04T09:00:00.000Z' })
			];

			expect(sortedIds(routines, 'last-used', { runs, workPeriods: [] })).toEqual(['b', 'a', 'c']);
		});

		it('puts routines never run last, in custom order', () => {
			const routines = [
				routineWith({ id: 'never-2', customPosition: 0 }),
				routineWith({ id: 'used', customPosition: 1 }),
				routineWith({ id: 'never-1', customPosition: 2 })
			];
			const runs = [runWith({ routineId: 'used' })];

			expect(sortedIds(routines, 'last-used', { runs, workPeriods: [] })).toEqual([
				'used',
				'never-2',
				'never-1'
			]);
		});

		it('keeps custom order between routines last run at the same moment', () => {
			const routines = [
				routineWith({ id: 'second', customPosition: 1 }),
				routineWith({ id: 'first', customPosition: 0 })
			];
			const runs = [
				runWith({ id: 'run-1', routineId: 'first' }),
				runWith({ id: 'run-2', routineId: 'second' })
			];

			expect(sortedIds(routines, 'last-used', { runs, workPeriods: [] })).toEqual([
				'first',
				'second'
			]);
		});

		it('counts a run that is still in progress', () => {
			const routines = [
				routineWith({ id: 'old', customPosition: 0 }),
				routineWith({ id: 'live', customPosition: 1 })
			];
			const runs = [
				runWith({
					id: 'run-1',
					routineId: 'old',
					startedAt: '2026-11-01T09:00:00.000Z',
					endedAt: '2026-11-01T10:00:00.000Z',
					outcome: 'completed'
				}),
				runWith({ id: 'run-2', routineId: 'live', startedAt: '2026-11-02T09:00:00.000Z' })
			];

			expect(sortedIds(routines, 'last-used', { runs, workPeriods: [] })).toEqual(['live', 'old']);
		});
	});

	describe('most work', () => {
		it('puts the routine with the most total worked time first, summing its work periods', () => {
			const routines = [
				routineWith({ id: 'a', customPosition: 0 }),
				routineWith({ id: 'b', customPosition: 1 }),
				routineWith({ id: 'c', customPosition: 2 })
			];
			const workPeriods = [
				workPeriodWith({ id: 'p1', routineId: 'a', workedMs: minutes(30) }),
				workPeriodWith({ id: 'p2', routineId: 'b', workedMs: minutes(20) }),
				workPeriodWith({ id: 'p3', routineId: 'b', workedMs: minutes(20) }),
				workPeriodWith({ id: 'p4', routineId: 'c', workedMs: minutes(35) })
			];

			expect(sortedIds(routines, 'most-work', { runs: [], workPeriods })).toEqual(['b', 'c', 'a']);
		});

		it('puts routines with no work last, in custom order', () => {
			const routines = [
				routineWith({ id: 'idle-2', customPosition: 0 }),
				routineWith({ id: 'worked', customPosition: 1 }),
				routineWith({ id: 'idle-1', customPosition: 2 })
			];
			const workPeriods = [workPeriodWith({ routineId: 'worked', workedMs: minutes(1) })];

			expect(sortedIds(routines, 'most-work', { runs: [], workPeriods })).toEqual([
				'worked',
				'idle-2',
				'idle-1'
			]);
		});

		it('keeps custom order between routines with the same total', () => {
			const routines = [
				routineWith({ id: 'second', customPosition: 1 }),
				routineWith({ id: 'first', customPosition: 0 })
			];
			const workPeriods = [
				workPeriodWith({ id: 'p1', routineId: 'first', workedMs: minutes(10) }),
				workPeriodWith({ id: 'p2', routineId: 'second', workedMs: minutes(10) })
			];

			expect(sortedIds(routines, 'most-work', { runs: [], workPeriods })).toEqual([
				'first',
				'second'
			]);
		});
	});

	it('returns a new list and leaves the given one as it was', () => {
		const routines = [
			routineWith({ id: 'b', customPosition: 1 }),
			routineWith({ id: 'a', customPosition: 0 })
		];

		const sorted = sortRoutines(routines, 'custom', noUsage);

		expect(sorted).not.toBe(routines);
		expect(routines.map((routine) => routine.id)).toEqual(['b', 'a']);
	});
});
