import { describe, expect, it } from 'vitest';
import type { Block } from './routine';
import {
	earnedBreakMs,
	firstPosition,
	nextPosition,
	positionLabel,
	workedMs,
	type Position,
	type RoutinePlan
} from './run';

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

describe('workedMs', () => {
	it('is 0 before any work', () => {
		expect(workedMs([], null, 5_000)).toBe(0);
	});

	it('counts the running stretch up to now', () => {
		expect(workedMs([], 10_000, 70_000)).toBe(60_000);
	});

	it('adds up the ended segments, leaving out the paused time between them', () => {
		const segments = [
			{ start: 0, end: 1_000 },
			{ start: 5_000, end: 8_000 }
		];

		expect(workedMs(segments, null, 20_000)).toBe(4_000);
	});

	it('adds the running stretch to the ended segments', () => {
		expect(workedMs([{ start: 0, end: 1_000 }], 5_000, 7_500)).toBe(3_500);
	});

	it('keeps every millisecond rather than rounding to seconds', () => {
		expect(workedMs([{ start: 0, end: 1_499 }], null, 2_000)).toBe(1_499);
	});

	it("counts the running stretch as 0 when the device's clock has moved back", () => {
		expect(workedMs([{ start: 0, end: 500 }], 10_000, 9_000)).toBe(500);
	});
});

describe('earnedBreakMs', () => {
	it.each<[rule: string, worked: number, breakPercent: number, earned: number]>([
		['earns 5 minutes for 25 minutes at 20%', 25 * 60_000, 20, 5 * 60_000],
		['earns 15 minutes for 25 minutes at 60%', 25 * 60_000, 60, 15 * 60_000],
		['earns from the time worked, past the target', 31 * 60_000 + 40_000, 20, 6 * 60_000 + 20_000],
		['rounds an exact half second up', 2_500, 20, 1_000],
		['rounds just below a half second down', 2_499, 20, 0],
		['earns no break for a few seconds of work', 1_000, 20, 0],
		['earns nothing for no work', 0, 20, 0],
		[
			'rounds a half up where dividing the percentage first would round it down',
			50_000,
			29,
			15_000
		],
		['gives the time worked, rounded, at 100%', 61_500, 100, 62_000],
		['has no cap', 4 * 3_600_000, 100, 4 * 3_600_000]
	])('%s', (_rule, worked, breakPercent, earned) => {
		expect(earnedBreakMs(worked, breakPercent)).toBe(earned);
	});
});

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
