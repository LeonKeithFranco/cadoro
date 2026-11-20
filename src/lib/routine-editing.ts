// The rules for editing a routine in place on the Routines screen: whether the edit has unsaved
// changes, what another tab did to the routine meanwhile, when it's locked, and where the keyboard
// focus goes after a delete.

import { withTrimmedTitles, type Routine } from './routine';

/** A routine being edited, with the routine as it was before the edit. */
export type RoutineEdit = {
	/** The routine as it was when editing started, which Cancel goes back to. */
	original: Routine;
	/** The routine with the user's changes so far. */
	draft: Routine;
	/** Whether it's a new routine, which isn't saved until Save is pressed. */
	isNew: boolean;
	/** What went wrong the last time Save was pressed, if anything. */
	saveError?: string | undefined;
	/**
	 * Whether another tab changed this routine's title, rounds or blocks since editing started,
	 * so Save would overwrite that change.
	 */
	isChangedElsewhere?: boolean;
};

/** What another tab has done to the routine being edited, as far as the edit is concerned. */
export type ChangeElsewhere = 'deleted' | 'changed' | 'none';

/** Why a routine can't be saved while a run of it has started. */
export const LOCKED_BY_RUN_REASON =
	'A run of this routine has started, so it can’t be saved. Cancel, and edit it once the run ends.';

/**
 * Says whether two routines differ in what an edit changes: the title, the rounds or the blocks.
 *
 * @remarks
 * Its place in the custom order, its creation date and its deletion aren't compared, so a change
 * that only moves the routine in the list isn't taken for an edit.
 *
 * @param a - One routine.
 * @param b - The other routine.
 * @returns Whether the title, the rounds or any block differs, the blocks' order included.
 */
export function differsInContent(a: Routine, b: Routine): boolean {
	return (
		JSON.stringify([a.title, a.rounds, a.blocks]) !== JSON.stringify([b.title, b.rounds, b.blocks])
	);
}

/**
 * Says whether an edit has changes that Save would keep.
 *
 * @remarks
 * Titles are compared trimmed, as they're saved, so a space typed after the title isn't a change.
 *
 * @param edit - The edit.
 * @returns Whether the draft differs from the original in its title, rounds or blocks, once both
 * have their titles trimmed.
 */
export function hasUnsavedChanges(edit: RoutineEdit): boolean {
	return differsInContent(withTrimmedTitles(edit.draft), withTrimmedTitles(edit.original));
}

/**
 * Works out what has happened to the routine being edited, from the routines as storage now has
 * them.
 *
 * @param original - The routine as it was when editing started.
 * @param saved - The routines not deleted, as storage now has them.
 * @returns `'deleted'` when the routine is no longer among them, `'changed'` when its title,
 * rounds or blocks differ from the original's, and `'none'` otherwise, which includes a change
 * that only moved it in the list.
 */
export function changeElsewhere(original: Routine, saved: readonly Routine[]): ChangeElsewhere {
	const latest = saved.find((routine) => routine.id === original.id);
	if (latest === undefined) {
		return 'deleted';
	}
	return differsInContent(latest, original) ? 'changed' : 'none';
}

/**
 * Says why an edit can't be saved, which it can't once a run of its routine has started.
 *
 * @param edit - The edit.
 * @param runningRoutineId - The id of the routine a run is running, or whose ended run's summary
 * is still open, or `null` when none is.
 * @returns The reason, which is {@link LOCKED_BY_RUN_REASON}, when the edit is of a saved routine
 * that's running, or `undefined` when it can be saved. A new routine can't be running, so it's
 * never locked.
 */
export function lockedReason(
	edit: RoutineEdit,
	runningRoutineId: string | null
): string | undefined {
	return !edit.isNew && edit.original.id === runningRoutineId ? LOCKED_BY_RUN_REASON : undefined;
}

/**
 * Picks the routine whose card takes the keyboard focus once a routine is deleted: the one that
 * takes the deleted card's place, or the one above it when the deleted card was the last.
 *
 * @param shown - The routines in the order the list shows them, the deleted one included.
 * @param deletedId - The id of the routine being deleted.
 * @returns The routine whose card takes the focus, or `undefined` when no other routine is
 * shown. When the deleted routine isn't among those shown, as when another tab deleted it first,
 * it's the first one shown.
 */
export function focusAfterDelete(
	shown: readonly Routine[],
	deletedId: string
): Routine | undefined {
	const position = shown.findIndex((routine) => routine.id === deletedId);
	return shown[position + 1] ?? shown[position - 1];
}
