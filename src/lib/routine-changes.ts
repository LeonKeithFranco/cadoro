// Working out what each change to the routines saves and logs, shared by every storage backend,
// so they all keep the same rules and write the same log entries.

import type { NewLogEntry } from './log';
import { canDeleteRoutine, pickableRoutines, type Routine } from './routine';
import { insertRoutine } from './routine-order';

/** What a change to the routines saves, and the log entry that records it. */
export type RoutineChange = {
	/** The routines to save, each replacing the saved routine with its id, or added if none has it. */
	writes: Routine[];
	/** What the change adds to the activity log. */
	entry: NewLogEntry;
};

/**
 * The parts of a routine that an edit changes, which an edit's log entry holds old and new.
 *
 * @remarks
 * A routine's id, position and dates are left out, since an edit doesn't change them.
 */
type RoutineContent = Pick<Routine, 'title' | 'rounds' | 'blocks'>;

/**
 * Picks out what an edit changes.
 *
 * @param routine - The routine.
 * @returns Its title, rounds and blocks.
 */
function contentOf(routine: Routine): RoutineContent {
	return { title: routine.title, rounds: routine.rounds, blocks: routine.blocks };
}

/**
 * Finds a routine that isn't deleted.
 *
 * @param routines - Every routine saved, deleted ones included.
 * @param id - The routine's id.
 * @returns The routine.
 * @throws {@link Error} When no routine that isn't deleted has that id.
 */
function findLiveRoutine(routines: Routine[], id: string): Routine {
	const found = routines.find((routine) => routine.id === id && routine.deletedAt === null);
	if (found === undefined) {
		throw new Error(`Expected a routine that isn't deleted with id ${id}, but none is saved.`);
	}
	return found;
}

/**
 * Refuses a change to the routine of the run in progress, since a run restored from storage
 * needs its routine, and the run is about what the routine was when it started.
 *
 * @param routine - The routine to change.
 * @param runningRoutineId - The id of the routine of the run in progress, or `null` for none.
 * @param change - What would be done to it, as a past participle, for the message.
 * @throws {@link Error} When the routine is the running one.
 */
function refuseRunning(routine: Routine, runningRoutineId: string | null, change: string): void {
	if (routine.id === runningRoutineId) {
		throw new Error(`The routine "${routine.title}" is running, so it can't be ${change}.`);
	}
}

/**
 * Works out what saving a routine at the top, or at another place in the list, changes.
 *
 * @remarks
 * Every routine that isn't deleted is renumbered 0, 1, 2 and so on around the new one, so only
 * those whose position changes are saved with it. Deleted routines keep their positions.
 *
 * @param routines - Every routine saved, deleted ones included.
 * @param routine - The routine to add, whose own `customPosition` is where it goes among the
 * routines that aren't deleted.
 * @param now - The moment of the change.
 * @returns The routine, with its final position, and the routines it moved.
 * @throws {@link Error} When a routine with the same id is saved already.
 */
export function planCreate(routines: Routine[], routine: Routine, now: Date): RoutineChange {
	if (routines.some((saved) => saved.id === routine.id)) {
		throw new Error(`A routine with id ${routine.id} is already saved.`);
	}

	const placed = insertRoutine(pickableRoutines(routines), routine, routine.customPosition);
	const created = placed.find((candidate) => candidate.id === routine.id) ?? routine;
	return {
		writes: changedOrNew(routines, placed),
		entry: {
			timestamp: now.toISOString(),
			type: 'change',
			message: `Created routine "${routine.title}"`,
			details: { action: 'create', routineId: routine.id, routine: created }
		}
	};
}

/**
 * Works out what saving a copy of a routine just below it changes.
 *
 * @param routines - Every routine saved, deleted ones included.
 * @param copy - The copy to add, which `duplicateRoutine` made. Its own `customPosition` is
 * ignored.
 * @param originalId - The id of the routine it copies.
 * @param now - The moment of the change.
 * @returns The copy, placed below the original, and the routines it moved.
 * @throws {@link Error} When no routine that isn't deleted has the original's id, or a routine with
 * the copy's id is saved already.
 */
export function planDuplicate(
	routines: Routine[],
	copy: Routine,
	originalId: string,
	now: Date
): RoutineChange {
	const original = findLiveRoutine(routines, originalId);
	// A delete leaves a gap in the positions, so the original's place in the list is its index
	// among the routines not deleted, not its `customPosition`.
	const originalIndex = pickableRoutines(routines).findIndex(
		(routine) => routine.id === originalId
	);
	const created = planCreate(routines, { ...copy, customPosition: originalIndex + 1 }, now);
	const placedCopy = created.writes.find((candidate) => candidate.id === copy.id) ?? copy;
	return {
		writes: created.writes,
		entry: {
			timestamp: now.toISOString(),
			type: 'change',
			message: `Duplicated routine "${original.title}" as "${copy.title}"`,
			details: { action: 'duplicate', routineId: copy.id, originalId, routine: placedCopy }
		}
	};
}

/**
 * Works out what saving an edit to a routine changes.
 *
 * @remarks
 * Only the title, rounds and blocks are taken from the edit. The saved position, creation date and
 * deletion stay as they are, so an edit worked out before a reorder can't undo it.
 *
 * @param routines - Every routine saved, deleted ones included.
 * @param edited - The routine as edited, with the id of the routine it edits.
 * @param now - The moment of the change.
 * @param runningRoutineId - The id of the routine of the run in progress, or `null` when none is
 * running, which can't be edited.
 * @returns The routine as it's now saved, and a log entry with its old and new content.
 * @throws {@link Error} When no routine that isn't deleted has the edit's id, or when it's the
 * running routine.
 */
export function planSave(
	routines: Routine[],
	edited: Routine,
	now: Date,
	runningRoutineId: string | null = null
): RoutineChange {
	const saved = findLiveRoutine(routines, edited.id);
	refuseRunning(saved, runningRoutineId, 'edited');
	const result: Routine = { ...saved, ...contentOf(edited) };
	return {
		writes: [result],
		entry: {
			timestamp: now.toISOString(),
			type: 'change',
			message: `Edited routine "${result.title}"`,
			details: {
				action: 'edit',
				routineId: saved.id,
				old: contentOf(saved),
				new: contentOf(result)
			}
		}
	};
}

/**
 * Works out what deleting a routine changes, which is setting its `deletedAt`.
 *
 * @param routines - Every routine saved, deleted ones included.
 * @param id - The id of the routine to delete.
 * @param now - The moment of the change, which becomes the routine's `deletedAt`.
 * @param runningRoutineId - The id of the routine of the run in progress, or `null` when none is
 * running, which can't be deleted.
 * @returns The deleted routine, with a log entry holding what it was, or `null` when it's the only
 * routine not deleted, which is never deleted, so there's always one to run.
 * @throws {@link Error} When no routine that isn't deleted has that id, or when it's the running
 * routine.
 */
export function planDelete(
	routines: Routine[],
	id: string,
	now: Date,
	runningRoutineId: string | null = null
): RoutineChange | null {
	const routine = findLiveRoutine(routines, id);
	refuseRunning(routine, runningRoutineId, 'deleted');
	if (!canDeleteRoutine(routines)) {
		return null;
	}

	return {
		writes: [{ ...routine, deletedAt: now.toISOString() }],
		entry: {
			timestamp: now.toISOString(),
			type: 'change',
			message: `Deleted routine "${routine.title}"`,
			details: { action: 'delete', routineId: id, routine }
		}
	};
}

/**
 * Works out what putting the routines in a new custom order changes.
 *
 * @param routines - Every routine saved, deleted ones included.
 * @param orderedIds - The ids of every routine that isn't deleted, in their new order.
 * @param now - The moment of the change.
 * @returns The routines whose position changes, numbered by their place in the new order, and a
 * log entry with the old and new order, or `null` when the order is already the saved one.
 * @throws {@link Error} When the ids aren't exactly those of the routines that aren't deleted, each
 * once.
 */
export function planReorder(
	routines: Routine[],
	orderedIds: string[],
	now: Date
): RoutineChange | null {
	const oldOrder = pickableRoutines(routines);
	const oldIds = oldOrder.map((routine) => routine.id);
	const isSameSet =
		orderedIds.length === oldIds.length &&
		new Set(orderedIds).size === orderedIds.length &&
		orderedIds.every((id) => oldIds.includes(id));
	if (!isSameSet) {
		throw new Error('Expected the id of every routine not deleted, each once, to put in order.');
	}

	const renumbered = orderedIds.flatMap((id, index) => {
		const routine = oldOrder.find((candidate) => candidate.id === id);
		return routine === undefined ? [] : [{ ...routine, customPosition: index }];
	});
	const writes = changedOrNew(routines, renumbered);
	if (writes.length === 0) {
		return null;
	}

	return {
		writes,
		entry: {
			timestamp: now.toISOString(),
			type: 'change',
			message: 'Reordered routines',
			details: { action: 'reorder', old: oldIds, new: orderedIds }
		}
	};
}

/**
 * Picks the routines that differ from what's saved, or aren't saved yet.
 *
 * @param saved - Every routine saved.
 * @param candidates - The routines as they should be.
 * @returns The candidates whose saved version has another position, or that aren't saved.
 */
function changedOrNew(saved: Routine[], candidates: Routine[]): Routine[] {
	return candidates.filter((candidate) => {
		const before = saved.find((routine) => routine.id === candidate.id);
		return before === undefined || before.customPosition !== candidate.customPosition;
	});
}
