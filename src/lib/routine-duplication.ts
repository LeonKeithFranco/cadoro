// Copying a routine, for its Duplicate button.

import type { Routine } from './routine';
import { TITLE_MAX_LENGTH } from './routine-limits';

/** What a copy's title adds to the original's. */
const COPY_SUFFIX = ' (copy)';

/**
 * Names a copy of a routine.
 *
 * @remarks
 * The spec names it "<title> (copy)". When that would pass the 50-character limit, the original's
 * title is cut short, so the copy's title is always valid.
 *
 * @param title - The original's title.
 * @returns The title with " (copy)" after it, at most 50 characters.
 */
export function copyTitle(title: string): string {
	const room = TITLE_MAX_LENGTH - COPY_SUFFIX.length;
	const kept = title.length > room ? title.slice(0, room).trimEnd() : title;
	return `${kept}${COPY_SUFFIX}`;
}

/**
 * Makes a copy of a routine with the same rounds and blocks.
 *
 * @remarks
 * Its stats start empty, because its id and its blocks' ids are new, and a run or work period
 * belongs to an id. It has the original's `customPosition`, so `planDuplicate` places it, just
 * below the original.
 *
 * @param routine - The routine to copy.
 * @param now - The moment the copy is created.
 * @param newId - Returns a new unique id each time it's called, such as `crypto.randomUUID`.
 * @returns A new routine named by {@link copyTitle}, created now and not deleted, whose blocks
 * are copies with new ids.
 */
export function duplicateRoutine(routine: Routine, now: Date, newId: () => string): Routine {
	return {
		...routine,
		id: newId(),
		title: copyTitle(routine.title),
		blocks: routine.blocks.map((block) => ({ ...block, id: newId() })),
		createdAt: now.toISOString(),
		deletedAt: null
	};
}
