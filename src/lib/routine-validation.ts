// Checking a routine against the limits in the data model, saying what's wrong with each field.

import {
	BLOCKS_MAX,
	BLOCKS_MIN,
	BREAK_PERCENT_MAX,
	BREAK_PERCENT_MIN,
	CYCLES_MAX,
	CYCLES_MIN,
	ROUNDS_MAX,
	ROUNDS_MIN,
	TARGET_MINUTES_MAX,
	TARGET_MINUTES_MIN,
	TITLE_MAX_LENGTH,
	TITLE_MIN_LENGTH
} from './routine-limits';
import type { Block, Routine } from './routine';

/** What's wrong with a block's fields. A field that's fine has no entry. */
export type BlockProblems = {
	/** What's wrong with the title, if anything. */
	title?: string;
	/** What's wrong with the work target, if anything. */
	targetMinutes?: string;
	/** What's wrong with the break percentage, if anything. */
	breakPercent?: string;
	/** What's wrong with the cycles, if anything. */
	cycles?: string;
};

/** What's wrong with a routine, in messages a form can show beside the fields. */
export type RoutineProblems = {
	/** What's wrong with the routine's title, if anything. */
	title?: string;
	/** What's wrong with the rounds, if anything. */
	rounds?: string;
	/** What's wrong with the number of blocks, if anything. */
	blocks?: string;
	/** What's wrong with each block's fields, by block id. Blocks with nothing wrong have no entry. */
	blockProblems: Record<string, BlockProblems>;
};

/**
 * Says whether a value is a whole number within limits.
 *
 * @param value - The value to check.
 * @param minimum - The smallest allowed value.
 * @param maximum - The largest allowed value.
 * @returns `true` when the value is a whole number from `minimum` to `maximum`, both included.
 */
function isWholeNumberBetween(value: number, minimum: number, maximum: number): boolean {
	return Number.isInteger(value) && value >= minimum && value <= maximum;
}

/**
 * Checks a title's length.
 *
 * @remarks
 * Surrounding spaces don't count, so a title of only spaces is blank.
 *
 * @param title - The title as typed.
 * @returns What's wrong with it, or `undefined` when it's fine.
 */
function titleProblem(title: string): string | undefined {
	const length = title.trim().length;
	if (length < TITLE_MIN_LENGTH) {
		return 'Enter a title.';
	}
	if (length > TITLE_MAX_LENGTH) {
		return `Use at most ${TITLE_MAX_LENGTH} characters.`;
	}
	return undefined;
}

/**
 * Checks a number against a whole-number range.
 *
 * @param value - The number as entered.
 * @param minimum - The smallest allowed value.
 * @param maximum - The largest allowed value.
 * @param unit - What the number counts, such as "minutes", for the message.
 * @returns What's wrong with it, or `undefined` when it's fine.
 */
function wholeNumberProblem(
	value: number,
	minimum: number,
	maximum: number,
	unit: string
): string | undefined {
	if (isWholeNumberBetween(value, minimum, maximum)) {
		return undefined;
	}
	return `Enter a whole number of ${unit}, from ${minimum} to ${maximum}.`;
}

/**
 * Checks a block's fields.
 *
 * @param block - The block to check.
 * @param isOnlyBlock - Whether it's the routine's only block, whose cycles must be 1.
 * @returns What's wrong with each field. A field that's fine has no entry.
 */
function blockProblems(block: Block, isOnlyBlock: boolean): BlockProblems {
	const problems: BlockProblems = {};

	const title = titleProblem(block.title);
	const targetMinutes = wholeNumberProblem(
		block.targetMinutes,
		TARGET_MINUTES_MIN,
		TARGET_MINUTES_MAX,
		'minutes'
	);
	const breakPercent = wholeNumberProblem(
		block.breakPercent,
		BREAK_PERCENT_MIN,
		BREAK_PERCENT_MAX,
		'percent'
	);
	const cycles = isOnlyBlock
		? onlyBlockCyclesProblem(block.cycles)
		: wholeNumberProblem(block.cycles, CYCLES_MIN, CYCLES_MAX, 'cycles');

	if (title !== undefined) problems.title = title;
	if (targetMinutes !== undefined) problems.targetMinutes = targetMinutes;
	if (breakPercent !== undefined) problems.breakPercent = breakPercent;
	if (cycles !== undefined) problems.cycles = cycles;
	return problems;
}

/**
 * Checks the cycles of a routine's only block, which are always 1.
 *
 * @param cycles - The cycles as entered.
 * @returns What's wrong with them, or `undefined` when they're 1.
 */
function onlyBlockCyclesProblem(cycles: number): string | undefined {
	return cycles === 1 ? undefined : 'A routine with one block has 1 cycle.';
}

/**
 * Checks a routine's rounds.
 *
 * @param rounds - The rounds as entered, or `'infinite'`.
 * @returns What's wrong with them, or `undefined` when they're fine.
 */
function roundsProblem(rounds: Routine['rounds']): string | undefined {
	if (rounds === 'infinite') {
		return undefined;
	}
	return wholeNumberProblem(rounds, ROUNDS_MIN, ROUNDS_MAX, 'rounds');
}

/**
 * Checks the number of blocks a routine has.
 *
 * @param count - How many blocks it has.
 * @returns What's wrong with it, or `undefined` when it's fine.
 */
function blockCountProblem(count: number): string | undefined {
	if (count < BLOCKS_MIN) {
		return `Add at least ${BLOCKS_MIN} block.`;
	}
	if (count > BLOCKS_MAX) {
		return `Use at most ${BLOCKS_MAX} blocks.`;
	}
	return undefined;
}

/**
 * Checks a routine against the data model's limits.
 *
 * @remarks
 * The limits are those in the spec's data model. A title's length ignores surrounding spaces,
 * and a routine's only block must have 1 cycle. The routine's other fields, such as its id and
 * dates, aren't checked, since the user doesn't type them.
 *
 * @param routine - The routine as it stands in the form.
 * @returns What's wrong, field by field. Nothing is wrong when {@link isValid} says so.
 */
export function validateRoutine(routine: Routine): RoutineProblems {
	const problems: RoutineProblems = { blockProblems: {} };

	const title = titleProblem(routine.title);
	const rounds = roundsProblem(routine.rounds);
	const blocks = blockCountProblem(routine.blocks.length);
	if (title !== undefined) problems.title = title;
	if (rounds !== undefined) problems.rounds = rounds;
	if (blocks !== undefined) problems.blocks = blocks;

	const isOnlyBlock = routine.blocks.length === 1;
	for (const block of routine.blocks) {
		const found = blockProblems(block, isOnlyBlock);
		if (Object.keys(found).length > 0) {
			problems.blockProblems[block.id] = found;
		}
	}
	return problems;
}

/**
 * Says whether a validation found nothing wrong.
 *
 * @param problems - What {@link validateRoutine} found.
 * @returns `true` when no field has a problem, so Save may be allowed.
 */
export function isValid(problems: RoutineProblems): boolean {
	return (
		problems.title === undefined &&
		problems.rounds === undefined &&
		problems.blocks === undefined &&
		Object.keys(problems.blockProblems).length === 0
	);
}
