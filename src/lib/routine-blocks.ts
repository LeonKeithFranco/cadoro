// Changing a routine's blocks: adding, duplicating, deleting and reordering, keeping the rule that
// a routine's only block has 1 cycle.

import { requireDefined } from './defined';
import { moveDown, moveToIndex, moveUp } from './list-order';
import { newBlock, type Block, type Routine } from './routine';
import { BLOCKS_MAX, BLOCKS_MIN } from './routine-limits';

/**
 * Says whether a routine has room for another block.
 *
 * @param routine - The routine.
 * @returns `true` when it has fewer than 20 blocks, so Add block and a block's Duplicate may be on.
 */
export function canAddBlock(routine: Routine): boolean {
	return routine.blocks.length < BLOCKS_MAX;
}

/**
 * Says whether a block may be deleted, which it may unless it's the routine's last one.
 *
 * @param routine - The routine.
 * @returns `true` when it has more than one block, so each block's Delete may be on.
 */
export function canDeleteBlock(routine: Routine): boolean {
	return routine.blocks.length > BLOCKS_MIN;
}

/**
 * Applies the rule that a routine's only block has 1 cycle.
 *
 * @remarks
 * With one block, cycles and rounds do the same job, so rounds repeat the block and the cycles
 * go back to 1. The rounds stay as they were.
 *
 * @param routine - The routine.
 * @returns The routine with its only block's cycles set to 1, or the routine as it is when it has
 * two or more blocks, or its only block already has 1 cycle.
 */
export function resetSingleBlockCycles(routine: Routine): Routine {
	const [only, ...others] = routine.blocks;
	if (only === undefined || others.length > 0 || only.cycles === 1) {
		return routine;
	}
	return { ...routine, blocks: [{ ...only, cycles: 1 }] };
}

/**
 * Adds a new default block at the end of a routine.
 *
 * @param routine - The routine.
 * @param newId - Returns a new unique id each time it's called, such as `crypto.randomUUID`.
 * @returns A new routine with a block of the defaults in {@link newBlock} added last.
 * @throws {@link Error} When the routine already has 20 blocks.
 */
export function addBlock(routine: Routine, newId: () => string): Routine {
	requireRoom(routine);
	return { ...routine, blocks: [...routine.blocks, newBlock(newId)] };
}

/**
 * Inserts a copy of a block just below it.
 *
 * @remarks
 * The copy has the same title, target, break percentage and cycles as the original, and a new id.
 *
 * @param routine - The routine.
 * @param blockId - The id of the block to copy.
 * @param newId - Returns a new unique id each time it's called, such as `crypto.randomUUID`.
 * @returns A new routine with the copy after the original.
 * @throws {@link Error} When the routine already has 20 blocks, or has no block with that id.
 */
export function duplicateBlock(routine: Routine, blockId: string, newId: () => string): Routine {
	requireRoom(routine);
	const index = indexOfBlock(routine, blockId);
	const original = requireDefined(routine.blocks[index], `the block with id ${blockId}`);
	const copy: Block = { ...original, id: newId() };
	return {
		...routine,
		blocks: [...routine.blocks.slice(0, index + 1), copy, ...routine.blocks.slice(index + 1)]
	};
}

/**
 * Deletes a block, applying the rule for a routine left with one block.
 *
 * @param routine - The routine.
 * @param blockId - The id of the block to delete.
 * @returns A new routine without the block, and with the remaining block's cycles reset to 1 when
 * it's the only one left. The rounds stay as they were.
 * @throws {@link Error} When it's the routine's only block, or the routine has no block with that
 * id.
 */
export function deleteBlock(routine: Routine, blockId: string): Routine {
	if (!canDeleteBlock(routine)) {
		throw new Error('Expected the routine to have more than one block to delete one.');
	}
	indexOfBlock(routine, blockId);
	const blocks = routine.blocks.filter((block) => block.id !== blockId);
	return resetSingleBlockCycles({ ...routine, blocks });
}

/**
 * Moves a block to an index in the run order.
 *
 * @param routine - The routine.
 * @param blockId - The id of the block to move.
 * @param index - Where it should end up, counting from 0. An index outside the blocks puts it
 * first or last.
 * @returns A new routine with the blocks in the new order.
 * @throws {@link Error} When the routine has no block with that id.
 */
export function moveBlockToIndex(routine: Routine, blockId: string, index: number): Routine {
	return { ...routine, blocks: moveToIndex(routine.blocks, blockId, index) };
}

/**
 * Moves a block one place earlier in the run order, for Move up.
 *
 * @param routine - The routine.
 * @param blockId - The id of the block to move.
 * @returns A new routine with the block one place earlier. The first block stays first.
 * @throws {@link Error} When the routine has no block with that id.
 */
export function moveBlockUp(routine: Routine, blockId: string): Routine {
	return { ...routine, blocks: moveUp(routine.blocks, blockId) };
}

/**
 * Moves a block one place later in the run order, for Move down.
 *
 * @param routine - The routine.
 * @param blockId - The id of the block to move.
 * @returns A new routine with the block one place later. The last block stays last.
 * @throws {@link Error} When the routine has no block with that id.
 */
export function moveBlockDown(routine: Routine, blockId: string): Routine {
	return { ...routine, blocks: moveDown(routine.blocks, blockId) };
}

/**
 * Finds a block's index.
 *
 * @param routine - The routine.
 * @param blockId - The id of the block.
 * @returns The block's index in the run order.
 * @throws {@link Error} When the routine has no block with that id.
 */
function indexOfBlock(routine: Routine, blockId: string): number {
	const index = routine.blocks.findIndex((block) => block.id === blockId);
	if (index === -1) {
		throw new Error(`Expected a block with id ${blockId}, but the routine has none.`);
	}
	return index;
}

/**
 * Checks that a routine has room for another block.
 *
 * @param routine - The routine.
 * @throws {@link Error} When the routine already has 20 blocks.
 */
function requireRoom(routine: Routine): void {
	if (!canAddBlock(routine)) {
		throw new Error(`Expected the routine to have fewer than ${BLOCKS_MAX} blocks to add one.`);
	}
}
