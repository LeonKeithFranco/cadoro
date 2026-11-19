import { describe, expect, it } from 'vitest';
import {
	insertRoutine,
	moveRoutineDown,
	moveRoutineToIndex,
	moveRoutineUp,
	renumberRoutines
} from './routine-order';
import { routineWith } from './testing/routines';

/** Three routines in custom order a, b, c. */
const abc = [
	routineWith({ id: 'a', customPosition: 0 }),
	routineWith({ id: 'b', customPosition: 1 }),
	routineWith({ id: 'c', customPosition: 2 })
];

/**
 * Lists each routine's id and position.
 *
 * @param routines - The routines.
 * @returns `id:position` for each, in the order given.
 */
function placed(routines: { id: string; customPosition: number }[]): string[] {
	return routines.map((routine) => `${routine.id}:${routine.customPosition}`);
}

describe('renumberRoutines', () => {
	it('closes gaps in the positions, keeping the order', () => {
		const gappy = [
			routineWith({ id: 'c', customPosition: 40 }),
			routineWith({ id: 'a', customPosition: 3 }),
			routineWith({ id: 'b', customPosition: 7 })
		];

		expect(placed(renumberRoutines(gappy))).toEqual(['a:0', 'b:1', 'c:2']);
	});

	it('breaks a tie in the order the routines were given', () => {
		const tied = [
			routineWith({ id: 'first', customPosition: 5 }),
			routineWith({ id: 'second', customPosition: 5 })
		];

		expect(placed(renumberRoutines(tied))).toEqual(['first:0', 'second:1']);
	});
});

describe('moveRoutineToIndex', () => {
	it('moves a routine and renumbers all of them', () => {
		expect(placed(moveRoutineToIndex(abc, 'a', 2))).toEqual(['b:0', 'c:1', 'a:2']);
	});

	it('moves a routine up to the first place', () => {
		expect(placed(moveRoutineToIndex(abc, 'c', 0))).toEqual(['c:0', 'a:1', 'b:2']);
	});

	it('puts a routine last for an index past the end', () => {
		expect(placed(moveRoutineToIndex(abc, 'a', 10))).toEqual(['b:0', 'c:1', 'a:2']);
	});

	it('works from the custom order, whatever order the routines are given in', () => {
		const shuffled = [
			routineWith({ id: 'c', customPosition: 2 }),
			routineWith({ id: 'a', customPosition: 0 }),
			routineWith({ id: 'b', customPosition: 1 })
		];

		expect(placed(moveRoutineToIndex(shuffled, 'c', 1))).toEqual(['a:0', 'c:1', 'b:2']);
		expect(placed(moveRoutineToIndex(shuffled, 'a', 0))).toEqual(['a:0', 'b:1', 'c:2']);
	});

	it('leaves the given routines as they were', () => {
		moveRoutineToIndex(abc, 'a', 2);

		expect(placed(abc)).toEqual(['a:0', 'b:1', 'c:2']);
	});

	it('throws when no routine has the id', () => {
		expect(() => moveRoutineToIndex(abc, 'missing', 0)).toThrow('missing');
	});
});

describe('moveRoutineUp', () => {
	it('swaps a routine with the one above it', () => {
		expect(placed(moveRoutineUp(abc, 'c'))).toEqual(['a:0', 'c:1', 'b:2']);
	});

	it('keeps the first routine first', () => {
		expect(placed(moveRoutineUp(abc, 'a'))).toEqual(['a:0', 'b:1', 'c:2']);
	});

	it('throws when no routine has the id', () => {
		expect(() => moveRoutineUp(abc, 'missing')).toThrow('missing');
	});
});

describe('moveRoutineDown', () => {
	it('swaps a routine with the one below it', () => {
		expect(placed(moveRoutineDown(abc, 'a'))).toEqual(['b:0', 'a:1', 'c:2']);
	});

	it('keeps the last routine last', () => {
		expect(placed(moveRoutineDown(abc, 'c'))).toEqual(['a:0', 'b:1', 'c:2']);
	});

	it('throws when no routine has the id', () => {
		expect(() => moveRoutineDown(abc, 'missing')).toThrow('missing');
	});
});

describe('insertRoutine', () => {
	const added = routineWith({ id: 'new', customPosition: 99 });

	it('puts a routine at the top and pushes the others down', () => {
		expect(placed(insertRoutine(abc, added, 0))).toEqual(['new:0', 'a:1', 'b:2', 'c:3']);
	});

	it('puts a routine below another', () => {
		expect(placed(insertRoutine(abc, added, 2))).toEqual(['a:0', 'b:1', 'new:2', 'c:3']);
	});

	it('puts a routine last for an index past the end, or first for one below 0', () => {
		expect(placed(insertRoutine(abc, added, 50))).toEqual(['a:0', 'b:1', 'c:2', 'new:3']);
		expect(placed(insertRoutine(abc, added, -1))).toEqual(['new:0', 'a:1', 'b:2', 'c:3']);
	});

	it('adds to an empty list', () => {
		expect(placed(insertRoutine([], added, 0))).toEqual(['new:0']);
	});
});
