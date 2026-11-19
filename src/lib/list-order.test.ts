import { describe, expect, it } from 'vitest';
import { moveDown, moveToIndex, moveUp } from './list-order';

/** Items for the tests, which only need an id. */
const abcd = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];

/**
 * Lists the ids of items.
 *
 * @param items - The items.
 * @returns Their ids, in order.
 */
function ids(items: { id: string }[]): string[] {
	return items.map((item) => item.id);
}

describe('moveToIndex', () => {
	it('moves an item later in the list', () => {
		expect(ids(moveToIndex(abcd, 'a', 2))).toEqual(['b', 'c', 'a', 'd']);
	});

	it('moves an item earlier in the list', () => {
		expect(ids(moveToIndex(abcd, 'd', 1))).toEqual(['a', 'd', 'b', 'c']);
	});

	it('leaves the list as it was when the item is already there', () => {
		expect(ids(moveToIndex(abcd, 'b', 1))).toEqual(['a', 'b', 'c', 'd']);
	});

	it('puts the item first for an index below 0 and last for an index past the end', () => {
		expect(ids(moveToIndex(abcd, 'c', -5))).toEqual(['c', 'a', 'b', 'd']);
		expect(ids(moveToIndex(abcd, 'b', 99))).toEqual(['a', 'c', 'd', 'b']);
	});

	it('returns a new list and leaves the given one as it was', () => {
		const moved = moveToIndex(abcd, 'a', 3);

		expect(moved).not.toBe(abcd);
		expect(ids(abcd)).toEqual(['a', 'b', 'c', 'd']);
	});

	it('throws, naming the id, when no item has it', () => {
		expect(() => moveToIndex(abcd, 'missing', 0)).toThrow(
			'Expected an item with id missing to move, but the list has none.'
		);
	});
});

describe('moveUp', () => {
	it('moves an item one place earlier', () => {
		expect(ids(moveUp(abcd, 'c'))).toEqual(['a', 'c', 'b', 'd']);
	});

	it('leaves the first item where it is', () => {
		expect(ids(moveUp(abcd, 'a'))).toEqual(['a', 'b', 'c', 'd']);
	});

	it('throws when no item has the id', () => {
		expect(() => moveUp(abcd, 'missing')).toThrow('missing');
	});
});

describe('moveDown', () => {
	it('moves an item one place later', () => {
		expect(ids(moveDown(abcd, 'b'))).toEqual(['a', 'c', 'b', 'd']);
	});

	it('leaves the last item where it is', () => {
		expect(ids(moveDown(abcd, 'd'))).toEqual(['a', 'b', 'c', 'd']);
	});

	it('throws when no item has the id', () => {
		expect(() => moveDown(abcd, 'missing')).toThrow('missing');
	});
});
