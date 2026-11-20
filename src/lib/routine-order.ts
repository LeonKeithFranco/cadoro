// Reordering routines in the custom order, which each routine's `customPosition` keeps.

import { inCustomOrder, type Routine } from './routine';

/**
 * Gives routines the positions 0, 1, 2 and so on, in the order the list has them.
 *
 * @param routines - The routines in their new order.
 * @returns New routines whose `customPosition` is their index.
 */
function numberedInOrder(routines: Routine[]): Routine[] {
	return routines.map((routine, index) => ({ ...routine, customPosition: index }));
}

/**
 * Adds a routine at an index in the custom order, such as a new routine at the top or a copy
 * below the routine it copies.
 *
 * @param routines - The routines already there, in any order.
 * @param routine - The routine to add. Its own `customPosition` is ignored.
 * @param index - Where it goes, counting from 0. An index outside the list puts it first or last.
 * @returns New routines, the added one included, in custom order, with `customPosition` 0, 1, 2
 * and so on.
 */
export function insertRoutine(routines: Routine[], routine: Routine, index: number): Routine[] {
	const ordered = inCustomOrder(routines);
	const place = Math.min(Math.max(index, 0), ordered.length);
	return numberedInOrder([...ordered.slice(0, place), routine, ...ordered.slice(place)]);
}
