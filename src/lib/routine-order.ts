// Reordering routines in the custom order, which each routine's `customPosition` keeps.

import { moveDown, moveToIndex, moveUp } from './list-order';
import type { Routine } from './routine';

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
 * Lists routines in custom order.
 *
 * @param routines - The routines in any order.
 * @returns A new list, lowest `customPosition` first.
 */
function inCustomOrder(routines: Routine[]): Routine[] {
	return routines.toSorted((a, b) => a.customPosition - b.customPosition);
}

/**
 * Closes any gaps and ties in the custom order.
 *
 * @param routines - The routines in any order.
 * @returns New routines in custom order, with `customPosition` 0, 1, 2 and so on. Routines with the
 * same position keep the order they were given in.
 */
export function renumberRoutines(routines: Routine[]): Routine[] {
	return numberedInOrder(inCustomOrder(routines));
}

/**
 * Moves a routine to an index in the custom order.
 *
 * @remarks
 * The caller passes the routines the list shows, so the index means a place in that list, and
 * leaves out any it keeps hidden, such as the deleted ones.
 *
 * @param routines - The routines in any order.
 * @param id - The id of the routine to move.
 * @param index - Where it should end up, counting from 0. An index outside the list puts it first
 * or last.
 * @returns New routines in the new custom order, with `customPosition` 0, 1, 2 and so on.
 * @throws {@link Error} When no routine has that id.
 */
export function moveRoutineToIndex(routines: Routine[], id: string, index: number): Routine[] {
	return numberedInOrder(moveToIndex(inCustomOrder(routines), id, index));
}

/**
 * Moves a routine one place up the custom order, for the Move up button.
 *
 * @param routines - The routines in any order.
 * @param id - The id of the routine to move.
 * @returns New routines in the new custom order. The first routine stays first.
 * @throws {@link Error} When no routine has that id.
 */
export function moveRoutineUp(routines: Routine[], id: string): Routine[] {
	return numberedInOrder(moveUp(inCustomOrder(routines), id));
}

/**
 * Moves a routine one place down the custom order, for the Move down button.
 *
 * @param routines - The routines in any order.
 * @param id - The id of the routine to move.
 * @returns New routines in the new custom order. The last routine stays last.
 * @throws {@link Error} When no routine has that id.
 */
export function moveRoutineDown(routines: Routine[], id: string): Routine[] {
	return numberedInOrder(moveDown(inCustomOrder(routines), id));
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
