// The run engine: moving through a routine's rounds, blocks and cycles. Every function here is
// pure, so the screen and the tests drive it the same way.

import { percentOf } from './percent';
import type { Routine } from './routine';
import { MS_PER_SECOND } from './time';

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

/**
 * One unpaused stretch of a work period, as moments in milliseconds since 1970 (UTC), the
 * same as `Date.now()` gives.
 */
export type Segment = {
	/** When the stretch started, by Play or by the work period starting. */
	readonly start: number;
	/** When the stretch ended, by Pause, Next or Finish. */
	readonly end: number;
};

/**
 * Works out how long a work period has been worked, from its timestamps.
 *
 * @remarks
 * Time comes from the moments work started and stopped, never from counting timer ticks, so it
 * stays exact when the browser slows or suspends the page. Paused time isn't in any segment, so
 * it never counts as work.
 *
 * @param segments - The stretches already ended by Pause.
 * @param runningSince - When the current stretch started, or `null` while paused.
 * @param now - The current moment, in milliseconds since 1970 (UTC).
 * @returns The time worked, in milliseconds, at full precision. A current stretch that would be
 * negative, because the device's clock moved back, counts as 0.
 */
export function workedMs(
	segments: readonly Segment[],
	runningSince: number | null,
	now: number
): number {
	let endedMs = 0;
	for (const segment of segments) {
		endedMs += segment.end - segment.start;
	}

	const isRunning = runningSince !== null;
	// The device's clock can move back, such as when it syncs, which would make this negative.
	const runningMs = isRunning ? Math.max(0, now - runningSince) : 0;

	return endedMs + runningMs;
}

/**
 * Works out the break a work period has earned.
 *
 * @remarks
 * The break is the time worked times the block's break percentage, with no cap or minimum. It's
 * rounded once, to the nearest whole second, with halves rounded up.
 *
 * @param worked - The time worked, in milliseconds.
 * @param breakPercent - The block's break percentage, a whole number from 1 to 100.
 * @returns The break earned, in whole seconds, as milliseconds.
 */
export function earnedBreakMs(worked: number, breakPercent: number): number {
	const earnedMs = percentOf(worked, breakPercent);
	const earnedSeconds = Math.round(earnedMs / MS_PER_SECOND);
	return earnedSeconds * MS_PER_SECOND;
}

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
	const blockHasNextCycle = cycle + 1 < plan.blocks[block].cycles;
	const roundHasNextBlock = block + 1 < plan.blocks.length;
	const routineHasNextRound = plan.rounds === 'infinite' || round + 1 < plan.rounds;

	if (blockHasNextCycle) {
		return { round, block, cycle: cycle + 1 };
	}
	if (roundHasNextBlock) {
		return { round, block: block + 1, cycle: 0 };
	}
	if (routineHasNextRound) {
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
	// Positions count from 0, as array indexes do, while the user counts from 1.
	const roundNumber = position.round + 1;
	const blockNumber = position.block + 1;
	const cycleNumber = position.cycle + 1;
	const cycles = plan.blocks[position.block].cycles;

	const parts: string[] = [];
	if (plan.rounds === 'infinite') {
		parts.push(`Round ${roundNumber}`);
	} else if (plan.rounds > 1) {
		parts.push(`Round ${roundNumber} of ${plan.rounds}`);
	}
	if (plan.blocks.length > 1) {
		parts.push(`Block ${blockNumber} of ${plan.blocks.length}`);
	}
	if (cycles > 1) {
		parts.push(`Cycle ${cycleNumber} of ${cycles}`);
	}

	return parts.join(' · ');
}
