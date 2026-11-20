import { describe, expect, it } from 'vitest';
import type { Block, Routine } from './routine';
import {
	changeElsewhere,
	differsInContent,
	focusAfterDelete,
	hasUnsavedChanges,
	LOCKED_BY_RUN_REASON,
	lockedReason,
	type RoutineEdit
} from './routine-editing';
import { routineWith } from './testing/routines';

/**
 * Makes a block for a test.
 *
 * @param id - The block's id.
 * @param title - The block's title.
 * @returns The block, with a 25-minute target, a 20% break and 1 cycle.
 */
function blockWith(id: string, title: string): Block {
	return { id, title, targetMinutes: 25, breakPercent: 20, cycles: 1 };
}

/** The routine the edits in these tests start from. */
const alpha = routineWith({
	id: 'alpha',
	title: 'Alpha',
	rounds: 2,
	blocks: [blockWith('write', 'Write'), blockWith('review', 'Review')],
	customPosition: 0
});

/**
 * Makes an edit of a saved routine.
 *
 * @param draft - The routine with the user's changes, Alpha unchanged unless a test gives one.
 * @returns The edit of Alpha.
 */
function editOfAlpha(draft: Routine = alpha): RoutineEdit {
	return { original: alpha, draft, isNew: false };
}

describe('differsInContent', () => {
	it('is false for the same title, rounds and blocks', () => {
		expect(differsInContent(alpha, { ...alpha })).toBe(false);
	});

	it('is true when the title differs', () => {
		expect(differsInContent(alpha, { ...alpha, title: 'Bravo' })).toBe(true);
	});

	it('is true when the rounds differ', () => {
		expect(differsInContent(alpha, { ...alpha, rounds: 'infinite' })).toBe(true);
	});

	it('is true when a block differs', () => {
		const blocks = [blockWith('write', 'Write'), { ...blockWith('review', 'Review'), cycles: 2 }];

		expect(differsInContent(alpha, { ...alpha, blocks })).toBe(true);
	});

	it('is true when the same blocks are in another order', () => {
		const blocks = [blockWith('review', 'Review'), blockWith('write', 'Write')];

		expect(differsInContent(alpha, { ...alpha, blocks })).toBe(true);
	});

	it('ignores the place in the custom order, the creation date and the deletion', () => {
		const moved = {
			...alpha,
			customPosition: 5,
			createdAt: '2026-11-19T10:00:00.000Z',
			deletedAt: '2026-11-20T10:00:00.000Z'
		};

		expect(differsInContent(alpha, moved)).toBe(false);
	});
});

describe('hasUnsavedChanges', () => {
	it('is false for an edit with no changes', () => {
		expect(hasUnsavedChanges(editOfAlpha())).toBe(false);
	});

	it('is true once the title is changed', () => {
		expect(hasUnsavedChanges(editOfAlpha({ ...alpha, title: 'Renamed' }))).toBe(true);
	});

	it('is false when the title only gains spaces around it, which saving trims', () => {
		expect(hasUnsavedChanges(editOfAlpha({ ...alpha, title: '  Alpha ' }))).toBe(false);
	});

	it('is false when a block title only gains spaces around it', () => {
		const blocks = [blockWith('write', ' Write  '), blockWith('review', 'Review')];

		expect(hasUnsavedChanges(editOfAlpha({ ...alpha, blocks }))).toBe(false);
	});

	it('is true once a block is changed', () => {
		const blocks = [blockWith('write', 'Write')];

		expect(hasUnsavedChanges(editOfAlpha({ ...alpha, blocks }))).toBe(true);
	});

	it('is false for a new routine nobody has typed in yet', () => {
		expect(hasUnsavedChanges({ original: alpha, draft: alpha, isNew: true })).toBe(false);
	});
});

describe('changeElsewhere', () => {
	/** Bravo, which stays saved beside Alpha. */
	const bravo = routineWith({ id: 'bravo', title: 'Bravo', customPosition: 1 });

	it('is none when the routine is saved as it was', () => {
		expect(changeElsewhere(alpha, [alpha, bravo])).toBe('none');
	});

	it('is deleted when the routine is no longer saved', () => {
		expect(changeElsewhere(alpha, [bravo])).toBe('deleted');
	});

	it('is changed when its title, rounds or blocks were saved differently', () => {
		expect(changeElsewhere(alpha, [{ ...alpha, rounds: 3 }, bravo])).toBe('changed');
	});

	it('is none when the routine was only moved in the list', () => {
		expect(changeElsewhere(alpha, [bravo, { ...alpha, customPosition: 1 }])).toBe('none');
	});
});

describe('lockedReason', () => {
	it('says why when the routine being edited is the one running', () => {
		expect(lockedReason(editOfAlpha(), 'alpha')).toBe(LOCKED_BY_RUN_REASON);
		expect(LOCKED_BY_RUN_REASON).toBe(
			'A run of this routine has started, so it can’t be saved. Cancel, and edit it once the run ends.'
		);
	});

	it('is undefined while another routine is running', () => {
		expect(lockedReason(editOfAlpha(), 'bravo')).toBeUndefined();
	});

	it('is undefined while no routine is running', () => {
		expect(lockedReason(editOfAlpha(), null)).toBeUndefined();
	});

	it('is undefined for a new routine, even one whose id matches the running routine', () => {
		expect(lockedReason({ original: alpha, draft: alpha, isNew: true }, 'alpha')).toBeUndefined();
	});
});

describe('focusAfterDelete', () => {
	/** Three routines in the order the list shows them. */
	const shown = [
		routineWith({ id: 'a', title: 'A' }),
		routineWith({ id: 'b', title: 'B' }),
		routineWith({ id: 'c', title: 'C' })
	];

	it('picks the routine below, which takes the deleted card’s place', () => {
		expect(focusAfterDelete(shown, 'a')?.id).toBe('b');
		expect(focusAfterDelete(shown, 'b')?.id).toBe('c');
	});

	it('picks the routine above when the last card is deleted', () => {
		expect(focusAfterDelete(shown, 'c')?.id).toBe('b');
	});

	it('picks none when the deleted routine was the only one shown', () => {
		expect(focusAfterDelete([routineWith({ id: 'a' })], 'a')).toBeUndefined();
	});

	it('picks the first routine when the deleted one isn’t shown', () => {
		expect(focusAfterDelete(shown, 'gone')?.id).toBe('a');
	});
});
