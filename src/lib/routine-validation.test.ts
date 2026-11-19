import { describe, expect, it } from 'vitest';
import type { Block, Routine } from './routine';
import { isValid, validateRoutine } from './routine-validation';
import { oneRoundRoutine, routineWith } from './testing/routines';

/**
 * Makes a block for a test, which differs from a valid 25-minute block only where it says.
 *
 * @param changes - The fields that differ.
 * @returns A new block.
 */
function blockWith(changes: Partial<Block>): Block {
	return {
		id: 'block',
		title: 'Focus',
		targetMinutes: 25,
		breakPercent: 20,
		cycles: 1,
		...changes
	};
}

/**
 * Makes a two-block routine, so the blocks' cycles are free to be more than 1.
 *
 * @param first - The changes to the first block.
 * @param second - The changes to the second block.
 * @returns A routine with blocks `first` and `second`.
 */
function twoBlockRoutine(first: Partial<Block>, second: Partial<Block> = {}): Routine {
	return routineWith({
		blocks: [blockWith({ id: 'first', ...first }), blockWith({ id: 'second', ...second })]
	});
}

describe('validateRoutine', () => {
	it('finds nothing wrong with a valid routine', () => {
		const problems = validateRoutine(oneRoundRoutine);

		expect(problems).toEqual({ blockProblems: {} });
		expect(isValid(problems)).toBe(true);
	});

	describe('the routine title', () => {
		it('rejects a blank title', () => {
			const problems = validateRoutine(routineWith({ title: '' }));

			expect(problems.title).toBe('Enter a title.');
			expect(isValid(problems)).toBe(false);
		});

		it('rejects a title of only spaces', () => {
			expect(validateRoutine(routineWith({ title: '   ' })).title).toBe('Enter a title.');
		});

		it('accepts 1 and 50 characters', () => {
			expect(validateRoutine(routineWith({ title: 'a' })).title).toBeUndefined();
			expect(validateRoutine(routineWith({ title: 'a'.repeat(50) })).title).toBeUndefined();
		});

		it('rejects 51 characters', () => {
			const problems = validateRoutine(routineWith({ title: 'a'.repeat(51) }));

			expect(problems.title).toBe('Use at most 50 characters.');
		});

		it('ignores surrounding spaces when counting', () => {
			const padded = ` ${'a'.repeat(50)} `;

			expect(validateRoutine(routineWith({ title: padded })).title).toBeUndefined();
		});
	});

	describe('the rounds', () => {
		it('accepts infinite rounds', () => {
			expect(validateRoutine(routineWith({ rounds: 'infinite' })).rounds).toBeUndefined();
		});

		it('accepts 1 and 99 rounds', () => {
			expect(validateRoutine(routineWith({ rounds: 1 })).rounds).toBeUndefined();
			expect(validateRoutine(routineWith({ rounds: 99 })).rounds).toBeUndefined();
		});

		it('rejects 0 and 100 rounds', () => {
			const message = 'Enter a whole number of rounds, from 1 to 99.';

			expect(validateRoutine(routineWith({ rounds: 0 })).rounds).toBe(message);
			expect(validateRoutine(routineWith({ rounds: 100 })).rounds).toBe(message);
		});

		it('rejects a fraction and a number that is not a number', () => {
			expect(validateRoutine(routineWith({ rounds: 2.5 })).rounds).toBeDefined();
			expect(validateRoutine(routineWith({ rounds: Number.NaN })).rounds).toBeDefined();
		});
	});

	describe('the number of blocks', () => {
		it('rejects a routine with no blocks', () => {
			const problems = validateRoutine(routineWith({ blocks: [] }));

			expect(problems.blocks).toBe('Add at least 1 block.');
			expect(isValid(problems)).toBe(false);
		});

		it('accepts 20 blocks and rejects 21', () => {
			const blocksNumbered = (count: number): Block[] =>
				Array.from({ length: count }, (_, index) => blockWith({ id: `block-${index}` }));

			expect(validateRoutine(routineWith({ blocks: blocksNumbered(20) })).blocks).toBeUndefined();
			expect(validateRoutine(routineWith({ blocks: blocksNumbered(21) })).blocks).toBe(
				'Use at most 20 blocks.'
			);
		});
	});

	describe('a block', () => {
		it('rejects a blank title and one over 50 characters, naming the block', () => {
			const blank = validateRoutine(twoBlockRoutine({ title: ' ' }));
			const long = validateRoutine(twoBlockRoutine({}, { title: 'a'.repeat(51) }));

			expect(blank.blockProblems).toEqual({ first: { title: 'Enter a title.' } });
			expect(long.blockProblems).toEqual({ second: { title: 'Use at most 50 characters.' } });
		});

		it('accepts targets of 1 and 240 minutes and rejects 0 and 241', () => {
			const targetOf = (targetMinutes: number): string | undefined =>
				validateRoutine(twoBlockRoutine({ targetMinutes })).blockProblems['first']?.targetMinutes;

			expect(targetOf(1)).toBeUndefined();
			expect(targetOf(240)).toBeUndefined();
			expect(targetOf(0)).toBe('Enter a whole number of minutes, from 1 to 240.');
			expect(targetOf(241)).toBe('Enter a whole number of minutes, from 1 to 240.');
			expect(targetOf(12.5)).toBeDefined();
		});

		it('accepts break percentages of 1 and 100 and rejects 0 and 101', () => {
			const percentOf = (breakPercent: number): string | undefined =>
				validateRoutine(twoBlockRoutine({ breakPercent })).blockProblems['first']?.breakPercent;

			expect(percentOf(1)).toBeUndefined();
			expect(percentOf(100)).toBeUndefined();
			expect(percentOf(0)).toBe('Enter a whole number of percent, from 1 to 100.');
			expect(percentOf(101)).toBe('Enter a whole number of percent, from 1 to 100.');
			expect(percentOf(20.5)).toBeDefined();
		});

		it('accepts cycles of 1 and 99 in a routine of several blocks and rejects 0 and 100', () => {
			const cyclesOf = (cycles: number): string | undefined =>
				validateRoutine(twoBlockRoutine({ cycles })).blockProblems['first']?.cycles;

			expect(cyclesOf(1)).toBeUndefined();
			expect(cyclesOf(99)).toBeUndefined();
			expect(cyclesOf(0)).toBe('Enter a whole number of cycles, from 1 to 99.');
			expect(cyclesOf(100)).toBe('Enter a whole number of cycles, from 1 to 99.');
			expect(cyclesOf(1.5)).toBeDefined();
		});

		it('requires the only block to have 1 cycle', () => {
			const problems = validateRoutine(
				routineWith({ blocks: [blockWith({ id: 'only', cycles: 3 })] })
			);

			expect(problems.blockProblems).toEqual({
				only: { cycles: 'A routine with one block has 1 cycle.' }
			});
		});

		it('reports every wrong field of a block and leaves out blocks that are fine', () => {
			const problems = validateRoutine(
				twoBlockRoutine({ title: '', targetMinutes: 0, breakPercent: 0, cycles: 0 })
			);

			expect(problems.blockProblems).toEqual({
				first: {
					title: 'Enter a title.',
					targetMinutes: 'Enter a whole number of minutes, from 1 to 240.',
					breakPercent: 'Enter a whole number of percent, from 1 to 100.',
					cycles: 'Enter a whole number of cycles, from 1 to 99.'
				}
			});
		});
	});

	it('reports problems in the routine and its blocks together', () => {
		const problems = validateRoutine({
			...twoBlockRoutine({ targetMinutes: 0 }),
			title: '',
			rounds: 0
		});

		expect(problems.title).toBeDefined();
		expect(problems.rounds).toBeDefined();
		expect(Object.keys(problems.blockProblems)).toEqual(['first']);
		expect(isValid(problems)).toBe(false);
	});
});
