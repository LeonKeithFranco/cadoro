import { describe, expect, it } from 'vitest';
import type { Block, Routine } from './routine';
import {
	addBlock,
	canAddBlock,
	canDeleteBlock,
	deleteBlock,
	duplicateBlock,
	moveBlockDown,
	moveBlockToIndex,
	moveBlockUp,
	resetSingleBlockCycles
} from './routine-blocks';
import { numberedIds } from './testing/ids';
import { routineWith } from './testing/routines';

/**
 * Makes a block for a test.
 *
 * @param id - The block's id.
 * @param changes - The fields that differ from a 25-minute block at 20% for 1 cycle.
 * @returns A new block.
 */
function blockWith(id: string, changes: Partial<Block> = {}): Block {
	return { id, title: `Block ${id}`, targetMinutes: 25, breakPercent: 20, cycles: 1, ...changes };
}

/**
 * Makes a routine with blocks of the given ids.
 *
 * @param ids - The ids of the blocks, in order.
 * @returns A routine of 3 rounds with those blocks.
 */
function routineOfBlocks(...ids: string[]): Routine {
	return routineWith({ rounds: 3, blocks: ids.map((id) => blockWith(id)) });
}

/**
 * Lists a routine's block ids.
 *
 * @param routine - The routine.
 * @returns The ids, in run order.
 */
function blockIds(routine: Routine): string[] {
	return routine.blocks.map((block) => block.id);
}

/**
 * Makes a routine with the most blocks it may have.
 *
 * @returns A routine of 20 blocks.
 */
function fullRoutine(): Routine {
	return routineOfBlocks(...Array.from({ length: 20 }, (_, index) => `block-${index}`));
}

describe('canAddBlock', () => {
	it('allows up to 20 blocks and no more', () => {
		expect(canAddBlock(routineOfBlocks('a'))).toBe(true);
		expect(canAddBlock(routineWith({ blocks: fullRoutine().blocks.slice(0, 19) }))).toBe(true);
		expect(canAddBlock(fullRoutine())).toBe(false);
	});
});

describe('canDeleteBlock', () => {
	it('refuses to delete the last block', () => {
		expect(canDeleteBlock(routineOfBlocks('a'))).toBe(false);
	});

	it('allows deleting when another block is left', () => {
		expect(canDeleteBlock(routineOfBlocks('a', 'b'))).toBe(true);
	});
});

describe('resetSingleBlockCycles', () => {
	it('sets the only block cycles back to 1 and leaves the rounds', () => {
		const routine = routineWith({ rounds: 4, blocks: [blockWith('a', { cycles: 3 })] });

		const reset = resetSingleBlockCycles(routine);

		expect(reset.blocks).toEqual([blockWith('a', { cycles: 1 })]);
		expect(reset.rounds).toBe(4);
	});

	it('returns the same routine when the only block already has 1 cycle', () => {
		const routine = routineOfBlocks('a');

		expect(resetSingleBlockCycles(routine)).toBe(routine);
	});

	it('leaves the cycles of a routine with two or more blocks', () => {
		const routine = routineWith({
			blocks: [blockWith('a', { cycles: 3 }), blockWith('b', { cycles: 2 })]
		});

		expect(resetSingleBlockCycles(routine)).toBe(routine);
	});

	it('returns a routine with no blocks as it is', () => {
		const routine = routineWith({ blocks: [] });

		expect(resetSingleBlockCycles(routine)).toBe(routine);
	});
});

describe('addBlock', () => {
	it('adds a default block at the end with an id from the generator', () => {
		const routine = routineOfBlocks('a', 'b');

		const added = addBlock(routine, numberedIds());

		expect(added.blocks).toEqual([
			...routine.blocks,
			{ id: 'id-1', title: 'Focus', targetMinutes: 25, breakPercent: 20, cycles: 1 }
		]);
	});

	it('leaves the given routine as it was', () => {
		const routine = routineOfBlocks('a');

		addBlock(routine, numberedIds());

		expect(blockIds(routine)).toEqual(['a']);
	});

	it('throws when the routine already has 20 blocks', () => {
		expect(() => addBlock(fullRoutine(), numberedIds())).toThrow(
			'Expected the routine to have fewer than 20 blocks to add one.'
		);
	});
});

describe('duplicateBlock', () => {
	it('inserts a copy with a new id just below the block, with the same fields', () => {
		const routine = routineWith({
			blocks: [
				blockWith('a'),
				blockWith('b', { title: 'Deep work', targetMinutes: 50, breakPercent: 30, cycles: 4 }),
				blockWith('c')
			]
		});

		const duplicated = duplicateBlock(routine, 'b', numberedIds());

		expect(blockIds(duplicated)).toEqual(['a', 'b', 'id-1', 'c']);
		expect(duplicated.blocks[2]).toEqual({
			id: 'id-1',
			title: 'Deep work',
			targetMinutes: 50,
			breakPercent: 30,
			cycles: 4
		});
	});

	it('copies the last block to the end', () => {
		expect(blockIds(duplicateBlock(routineOfBlocks('a', 'b'), 'b', numberedIds()))).toEqual([
			'a',
			'b',
			'id-1'
		]);
	});

	it('makes a second block from a routine with one, leaving both at 1 cycle', () => {
		const duplicated = duplicateBlock(routineOfBlocks('a'), 'a', numberedIds());

		expect(duplicated.blocks.map((block) => block.cycles)).toEqual([1, 1]);
	});

	it('throws when the routine already has 20 blocks', () => {
		expect(() => duplicateBlock(fullRoutine(), 'block-0', numberedIds())).toThrow('fewer than 20');
	});

	it('throws, naming the id, when no block has it', () => {
		expect(() => duplicateBlock(routineOfBlocks('a'), 'missing', numberedIds())).toThrow(
			'Expected a block with id missing, but the routine has none.'
		);
	});
});

describe('deleteBlock', () => {
	it('removes the block and keeps the others in order', () => {
		expect(blockIds(deleteBlock(routineOfBlocks('a', 'b', 'c'), 'b'))).toEqual(['a', 'c']);
	});

	it('keeps the cycles when two or more blocks are left', () => {
		const routine = routineWith({
			blocks: [blockWith('a', { cycles: 3 }), blockWith('b'), blockWith('c', { cycles: 2 })]
		});

		const deleted = deleteBlock(routine, 'b');

		expect(deleted.blocks.map((block) => block.cycles)).toEqual([3, 2]);
	});

	it('resets the cycles of the block left alone to 1, and keeps the rounds', () => {
		const routine = routineWith({
			rounds: 5,
			blocks: [blockWith('a', { cycles: 3 }), blockWith('b', { cycles: 2 })]
		});

		const deleted = deleteBlock(routine, 'a');

		expect(deleted.blocks).toEqual([blockWith('b', { cycles: 1 })]);
		expect(deleted.rounds).toBe(5);
	});

	it('throws when it is the only block', () => {
		expect(() => deleteBlock(routineOfBlocks('a'), 'a')).toThrow('more than one block');
	});

	it('throws when no block has the id', () => {
		expect(() => deleteBlock(routineOfBlocks('a', 'b'), 'missing')).toThrow('missing');
	});
});

describe('moving blocks', () => {
	it('moves a block to an index', () => {
		expect(blockIds(moveBlockToIndex(routineOfBlocks('a', 'b', 'c'), 'a', 2))).toEqual([
			'b',
			'c',
			'a'
		]);
	});

	it('moves a block up and keeps the first block first', () => {
		const routine = routineOfBlocks('a', 'b', 'c');

		expect(blockIds(moveBlockUp(routine, 'c'))).toEqual(['a', 'c', 'b']);
		expect(blockIds(moveBlockUp(routine, 'a'))).toEqual(['a', 'b', 'c']);
	});

	it('moves a block down and keeps the last block last', () => {
		const routine = routineOfBlocks('a', 'b', 'c');

		expect(blockIds(moveBlockDown(routine, 'a'))).toEqual(['b', 'a', 'c']);
		expect(blockIds(moveBlockDown(routine, 'c'))).toEqual(['a', 'b', 'c']);
	});

	it('changes only the blocks, and throws when no block has the id', () => {
		const routine = routineOfBlocks('a', 'b');

		expect(moveBlockDown(routine, 'a')).toMatchObject({ id: routine.id, rounds: 3 });
		expect(() => moveBlockToIndex(routine, 'missing', 0)).toThrow('missing');
		expect(() => moveBlockUp(routine, 'missing')).toThrow('missing');
		expect(() => moveBlockDown(routine, 'missing')).toThrow('missing');
	});
});
