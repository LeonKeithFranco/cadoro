// Moving an item within an ordered list, for routines in the list and blocks in a routine.

/**
 * Moves the item with an id to an index.
 *
 * @typeParam T - The type of the items, which each have an `id`.
 * @param items - The items in order.
 * @param id - The id of the item to move.
 * @param index - Where it should end up, counting from 0. One below 0 or past the end puts it
 * first or last.
 * @returns A new list with the item at that index and the others in their order.
 * @throws {@link Error} When no item has that id.
 */
export function moveToIndex<T extends { id: string }>(items: T[], id: string, index: number): T[] {
	const from = items.findIndex((item) => item.id === id);
	const moving = items[from];
	if (moving === undefined) {
		throw new Error(`Expected an item with id ${id} to move, but the list has none.`);
	}

	const lastIndex = items.length - 1;
	const to = Math.min(Math.max(index, 0), lastIndex);
	const others = items.filter((item) => item.id !== id);
	return [...others.slice(0, to), moving, ...others.slice(to)];
}

/**
 * Moves the item with an id one place up, towards the start.
 *
 * @typeParam T - The type of the items, which each have an `id`.
 * @param items - The items in order.
 * @param id - The id of the item to move.
 * @returns A new list with the item one place earlier, or in the same place if it's first.
 * @throws {@link Error} When no item has that id.
 */
export function moveUp<T extends { id: string }>(items: T[], id: string): T[] {
	return moveToIndex(items, id, items.findIndex((item) => item.id === id) - 1);
}

/**
 * Moves the item with an id one place down, towards the end.
 *
 * @typeParam T - The type of the items, which each have an `id`.
 * @param items - The items in order.
 * @param id - The id of the item to move.
 * @returns A new list with the item one place later, or in the same place if it's last.
 * @throws {@link Error} When no item has that id.
 */
export function moveDown<T extends { id: string }>(items: T[], id: string): T[] {
	return moveToIndex(items, id, items.findIndex((item) => item.id === id) + 1);
}
