// Routines for tests: the starter routines, which all repeat forever, and others made for tests.

import { requireDefined } from '../defined';
import { createStarterRoutines, type Block, type Routine } from '../routine';
import { numberedIds } from './ids';

/**
 * The starter routines, Classic then Classic with long break, created at the epoch with ids
 * numbered from `id-1`.
 */
export const starterRoutines: readonly Routine[] = createStarterRoutines(
	new Date(0),
	numberedIds()
);

/** The first starter routine, Classic. */
export const classic: Routine = requireDefined(starterRoutines[0], 'the Classic routine');

/** The second starter routine, Classic with long break. */
export const classicWithLongBreak: Routine = requireDefined(
	starterRoutines[1],
	'the Classic with long break routine'
);

/**
 * A routine of one round of one 25-minute block at 20%, so its first Next ends the run, as a
 * finite routine's last work period does.
 */
export const oneRoundRoutine: Routine = {
	id: 'one-round',
	title: 'One round',
	rounds: 1,
	blocks: [
		{ id: 'one-round-focus', title: 'Focus', targetMinutes: 25, breakPercent: 20, cycles: 1 }
	],
	customPosition: 0,
	createdAt: '1970-01-01T00:00:00.000Z',
	deletedAt: null
};

/**
 * Makes a routine for a test, which differs from {@link oneRoundRoutine} only where it says, so
 * each test shows just the fields it's about.
 *
 * @param changes - The fields that differ, such as `id` and `customPosition`.
 * @returns A new routine with those fields changed.
 */
export function routineWith(changes: Partial<Routine>): Routine {
	return { ...oneRoundRoutine, ...changes };
}

/**
 * Makes a block for a test, which is a valid 25-minute block at 20% for 1 cycle, except where it
 * says.
 *
 * @param changes - The fields that differ, such as `id` and `title`.
 * @returns A new block, with the id `block` and the title `Focus` unless changed.
 */
export function blockWith(changes: Partial<Block>): Block {
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
 * A routine of one 25-minute block at 20%, repeating forever, so Next always starts a 5-minute
 * break and Finish ends the run.
 */
export const foreverRoutine: Routine = routineWith({
	id: 'forever',
	title: 'Forever',
	rounds: 'infinite'
});
