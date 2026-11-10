// The run engine: moving through a routine's rounds, blocks and cycles. Every function here is
// pure, so the screen and the tests drive it the same way.

import type { Routine } from './routine';

/** The parts of a routine that decide the order a run goes through it. */
export type RoutinePlan = Pick<Routine, 'rounds' | 'blocks'>;

/**
 * Where a run is within its routine: which work period, and the break that follows it.
 *
 * @remarks
 * Each part counts from 0, as array indexes do. Labels shown to the user add 1.
 */
export type Position = {
	/** The pass through all the blocks, from 0. It has no limit in an infinite routine. */
	readonly round: number;
	/** The block within the round, from 0. */
	readonly block: number;
	/** The cycle within the block, from 0. */
	readonly cycle: number;
};

/** Where every run starts: the first cycle of the first block in the first round. */
export const firstPosition: Position = { round: 0, block: 0, cycle: 0 };

/**
 * Finds the work period that comes after the given one.
 *
 * @remarks
 * A run goes through block 1's cycles, then block 2's, and so on to the last block, which makes
 * one round. Then the next round starts at block 1, until a finite routine runs out of rounds.
 *
 * @param plan - The routine being run.
 * @param position - The current work period.
 * @returns The next work period, or `null` when the current one is a finite routine's last.
 */
export function nextPosition(plan: RoutinePlan, position: Position): Position | null {
	const { round, block, cycle } = position;

	if (cycle + 1 < plan.blocks[block].cycles) {
		return { round, block, cycle: cycle + 1 };
	}
	if (block + 1 < plan.blocks.length) {
		return { round, block: block + 1, cycle: 0 };
	}
	if (plan.rounds === 'infinite' || round + 1 < plan.rounds) {
		return { round: round + 1, block: 0, cycle: 0 };
	}
	return null;
}

/**
 * Describes where a run is, such as "Round 2 of 4 · Block 2 of 3 · Cycle 1 of 3".
 *
 * @remarks
 * A part whose total is 1, such as the block in a one-block routine, is left out, because it
 * never changes. An infinite routine always shows its round, with no total, such as "Round 5".
 *
 * @param plan - The routine being run.
 * @param position - The current work period.
 * @returns The parts that can change, joined by " · ". It's empty for a finite routine of one
 * round, one block and one cycle.
 */
export function positionLabel(plan: RoutinePlan, position: Position): string {
	const parts: string[] = [];

	if (plan.rounds === 'infinite') {
		parts.push(`Round ${position.round + 1}`);
	} else if (plan.rounds > 1) {
		parts.push(`Round ${position.round + 1} of ${plan.rounds}`);
	}
	if (plan.blocks.length > 1) {
		parts.push(`Block ${position.block + 1} of ${plan.blocks.length}`);
	}
	const cycles = plan.blocks[position.block].cycles;
	if (cycles > 1) {
		parts.push(`Cycle ${position.cycle + 1} of ${cycles}`);
	}

	return parts.join(' · ');
}
