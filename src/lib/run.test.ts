import { describe, expect, it } from 'vitest';
import type { Block } from './routine';
import { firstPosition, nextPosition, positionLabel, type Position, type RoutinePlan } from './run';

/**
 * Builds a routine plan with blocks that differ only in their number of cycles, which is all
 * that decides the order of a run.
 *
 * @param rounds - The routine's rounds, or `'infinite'`.
 * @param cycles - Each block's number of cycles, in run order.
 * @returns A plan with one 25-minute block at 20% for each entry in `cycles`.
 */
function plan(rounds: RoutinePlan['rounds'], ...cycles: number[]): RoutinePlan {
	const blocks: Block[] = cycles.map((count, index) => ({
		id: `block-${index + 1}`,
		title: `Block ${index + 1}`,
		targetMinutes: 25,
		breakPercent: 20,
		cycles: count
	}));
	return { rounds, blocks };
}

/**
 * Lists every work period a run goes through, from the first until `nextPosition` returns
 * `null`, or until `limit` positions for an infinite routine.
 *
 * @param routine - The routine to walk through.
 * @param limit - The most positions to list, so an infinite routine stops.
 * @returns The positions in run order.
 */
function walk(routine: RoutinePlan, limit = 100): Position[] {
	const positions: Position[] = [];
	let position: Position | null = firstPosition;
	while (position && positions.length < limit) {
		positions.push(position);
		position = nextPosition(routine, position);
	}
	return positions;
}

describe('firstPosition', () => {
	it('is the first cycle of the first block in the first round', () => {
		expect(firstPosition).toEqual({ round: 0, block: 0, cycle: 0 });
	});
});

describe('nextPosition', () => {
	it("goes through each block's cycles, then the next block, then the next round, then ends", () => {
		expect(walk(plan(2, 2, 1))).toEqual([
			{ round: 0, block: 0, cycle: 0 },
			{ round: 0, block: 0, cycle: 1 },
			{ round: 0, block: 1, cycle: 0 },
			{ round: 1, block: 0, cycle: 0 },
			{ round: 1, block: 0, cycle: 1 },
			{ round: 1, block: 1, cycle: 0 }
		]);
	});

	it('ends a one-round, one-block, one-cycle routine after its only work period', () => {
		expect(nextPosition(plan(1, 1), firstPosition)).toBeNull();
	});

	it('repeats a one-block, one-cycle infinite routine round after round', () => {
		expect(walk(plan('infinite', 1), 3)).toEqual([
			{ round: 0, block: 0, cycle: 0 },
			{ round: 1, block: 0, cycle: 0 },
			{ round: 2, block: 0, cycle: 0 }
		]);
	});

	it('never ends an infinite routine, even past 99 rounds', () => {
		expect(nextPosition(plan('infinite', 3, 1), { round: 150, block: 1, cycle: 0 })).toEqual({
			round: 151,
			block: 0,
			cycle: 0
		});
	});
});

describe('positionLabel', () => {
	it.each<[rule: string, routine: RoutinePlan, position: Position, label: string]>([
		[
			'shows every part when every total is above 1',
			plan(4, 1, 3, 2),
			{ round: 1, block: 1, cycle: 0 },
			'Round 2 of 4 · Block 2 of 3 · Cycle 1 of 3'
		],
		[
			'shows an infinite round with no total',
			plan('infinite', 3, 1),
			{ round: 4, block: 0, cycle: 2 },
			'Round 5 · Block 1 of 2 · Cycle 3 of 3'
		],
		[
			'leaves out the cycle in a block of 1 cycle',
			plan('infinite', 3, 1),
			{ round: 1, block: 1, cycle: 0 },
			'Round 2 · Block 2 of 2'
		],
		[
			'leaves out the block and cycle in a routine of one block of 1 cycle',
			plan('infinite', 1),
			{ round: 4, block: 0, cycle: 0 },
			'Round 5'
		],
		[
			'leaves out the round in a routine of 1 round',
			plan(1, 4, 1),
			{ round: 0, block: 0, cycle: 1 },
			'Block 1 of 2 · Cycle 2 of 4'
		],
		['is empty for a routine of 1 round, 1 block and 1 cycle', plan(1, 1), firstPosition, '']
	])('%s', (_rule, routine, position, label) => {
		expect(positionLabel(routine, position)).toBe(label);
	});
});
