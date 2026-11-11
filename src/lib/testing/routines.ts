// Routines for tests, beyond the starter routines, which all repeat forever.

import type { Routine } from '../routine';

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
