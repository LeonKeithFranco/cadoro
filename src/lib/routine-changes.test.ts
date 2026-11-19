import { describe, expect, it } from 'vitest';
import { requireDefined } from './defined';
import {
	planCreate,
	planDelete,
	planDuplicate,
	planReorder,
	planSave,
	type RoutineChange
} from './routine-changes';
import { routineWith } from './testing/routines';

/** The moment every change in these tests is made. */
const now = new Date('2026-11-19T10:00:00.000Z');

/** Three routines in custom order a, b, c. */
const abc = [
	routineWith({ id: 'a', title: 'A', customPosition: 0 }),
	routineWith({ id: 'b', title: 'B', customPosition: 1 }),
	routineWith({ id: 'c', title: 'C', customPosition: 2 })
];

/**
 * Lists each written routine's id and position.
 *
 * @param change - The change.
 * @returns `id:position` for each routine the change saves.
 */
function written(change: RoutineChange): string[] {
	return change.writes.map((routine) => `${routine.id}:${routine.customPosition}`);
}

/**
 * Returns a change that the test knows was planned.
 *
 * @param change - What a plan returned.
 * @returns The change.
 * @throws {@link Error} When the plan found nothing to change.
 */
function requireChange(change: RoutineChange | null): RoutineChange {
	if (change === null) {
		throw new Error('Expected a change, but the plan found nothing to change.');
	}
	return change;
}

describe('planCreate', () => {
	it('puts the routine at its position and moves down those from there on', () => {
		const created = routineWith({ id: 'new', title: 'New', customPosition: 0 });

		const change = planCreate(abc, created, now);

		expect(written(change).toSorted()).toEqual(['a:1', 'b:2', 'c:3', 'new:0']);
	});

	it('saves only the routines whose position changes', () => {
		const created = routineWith({ id: 'new', customPosition: 2 });

		const change = planCreate(abc, created, now);

		expect(written(change).toSorted()).toEqual(['c:3', 'new:2']);
	});

	it('counts the position among the routines that are not deleted', () => {
		const routines = [
			routineWith({ id: 'gone', customPosition: 0, deletedAt: '2026-11-01T00:00:00.000Z' }),
			routineWith({ id: 'a', customPosition: 1 }),
			routineWith({ id: 'b', customPosition: 2 })
		];

		const change = planCreate(routines, routineWith({ id: 'new', customPosition: 1 }), now);

		expect(written(change).toSorted()).toEqual(['a:0', 'new:1']);
	});

	it('logs the created routine as a change', () => {
		const created = routineWith({ id: 'new', title: 'New', customPosition: 0 });

		const { entry } = planCreate(abc, created, now);

		expect(entry).toEqual({
			timestamp: '2026-11-19T10:00:00.000Z',
			type: 'change',
			message: 'Created routine "New"',
			details: { action: 'create', routineId: 'new', routine: created }
		});
	});

	it('refuses an id that is saved already, even a deleted routine’s', () => {
		const routines = [routineWith({ id: 'a', deletedAt: '2026-11-01T00:00:00.000Z' })];

		expect(() => planCreate(routines, routineWith({ id: 'a' }), now)).toThrow('already saved');
	});
});

describe('planDuplicate', () => {
	it('places the copy just below the original, whatever position the copy has', () => {
		const copy = routineWith({ id: 'copy', title: 'A (copy)', customPosition: 0 });

		const change = planDuplicate(abc, copy, 'a', now);

		expect(written(change).toSorted()).toEqual(['b:2', 'c:3', 'copy:1']);
	});

	it('logs a duplicate with the original’s id', () => {
		const copy = routineWith({ id: 'copy', title: 'A (copy)' });

		const { entry } = planDuplicate(abc, copy, 'a', now);

		expect(entry).toEqual({
			timestamp: '2026-11-19T10:00:00.000Z',
			type: 'change',
			message: 'Duplicated routine "A" as "A (copy)"',
			details: {
				action: 'duplicate',
				routineId: 'copy',
				originalId: 'a',
				routine: { ...copy, customPosition: 1 }
			}
		});
	});

	it('refuses an original that is missing or deleted', () => {
		const routines = [
			routineWith({ id: 'a' }),
			routineWith({ id: 'gone', deletedAt: '2026-11-01T00:00:00.000Z' })
		];
		const copy = routineWith({ id: 'copy' });

		expect(() => planDuplicate(routines, copy, 'missing', now)).toThrow('none is saved');
		expect(() => planDuplicate(routines, copy, 'gone', now)).toThrow('none is saved');
	});
});

describe('planSave', () => {
	it('takes the title, rounds and blocks from the edit and keeps the saved position and dates', () => {
		const edited = routineWith({
			id: 'b',
			title: 'Renamed',
			rounds: 3,
			customPosition: 9,
			createdAt: '2000-01-01T00:00:00.000Z'
		});

		const change = planSave(abc, edited, now);

		expect(change.writes).toEqual([
			routineWith({ id: 'b', title: 'Renamed', rounds: 3, customPosition: 1 })
		]);
	});

	it('logs the old and new title, rounds and blocks', () => {
		const edited = routineWith({ id: 'b', title: 'Renamed', rounds: 3 });

		const { entry } = planSave(abc, edited, now);

		expect(entry.message).toBe('Edited routine "Renamed"');
		expect(entry.details).toEqual({
			action: 'edit',
			routineId: 'b',
			old: { title: 'B', rounds: 1, blocks: requireDefined(abc[1], 'b').blocks },
			new: { title: 'Renamed', rounds: 3, blocks: requireDefined(abc[1], 'b').blocks }
		});
	});

	it('refuses a routine that is missing or deleted', () => {
		const routines = [routineWith({ id: 'gone', deletedAt: '2026-11-01T00:00:00.000Z' })];

		expect(() => planSave(routines, routineWith({ id: 'missing' }), now)).toThrow('none is saved');
		expect(() => planSave(routines, routineWith({ id: 'gone' }), now)).toThrow('none is saved');
	});
});

describe('planDelete', () => {
	it('sets deletedAt to the moment of the change, and nothing else', () => {
		const change = requireChange(planDelete(abc, 'b', now));

		expect(change.writes).toEqual([
			{ ...requireDefined(abc[1], 'b'), deletedAt: '2026-11-19T10:00:00.000Z' }
		]);
	});

	it('logs what the routine was', () => {
		const change = requireChange(planDelete(abc, 'b', now));

		expect(change.entry.message).toBe('Deleted routine "B"');
		expect(change.entry.details).toEqual({
			action: 'delete',
			routineId: 'b',
			routine: abc[1]
		});
	});

	it('returns null for the only routine that is not deleted', () => {
		const routines = [
			routineWith({ id: 'only' }),
			routineWith({ id: 'gone', deletedAt: '2026-11-01T00:00:00.000Z' })
		];

		expect(planDelete(routines, 'only', now)).toBeNull();
	});

	it('refuses a routine that is missing or already deleted', () => {
		const routines = [...abc, routineWith({ id: 'gone', deletedAt: '2026-11-01T00:00:00.000Z' })];

		expect(() => planDelete(routines, 'missing', now)).toThrow('none is saved');
		expect(() => planDelete(routines, 'gone', now)).toThrow('none is saved');
	});
});

describe('planReorder', () => {
	it('saves only the routines whose position changes', () => {
		const change = requireChange(planReorder(abc, ['b', 'a', 'c'], now));

		expect(written(change).toSorted()).toEqual(['a:1', 'b:0']);
	});

	it('logs the old and new order', () => {
		const change = requireChange(planReorder(abc, ['c', 'a', 'b'], now));

		expect(change.entry).toEqual({
			timestamp: '2026-11-19T10:00:00.000Z',
			type: 'change',
			message: 'Reordered routines',
			details: { action: 'reorder', old: ['a', 'b', 'c'], new: ['c', 'a', 'b'] }
		});
	});

	it('returns null when the order is the saved one', () => {
		expect(planReorder(abc, ['a', 'b', 'c'], now)).toBeNull();
	});

	it('closes a gap in the saved positions', () => {
		const gappy = [
			routineWith({ id: 'a', customPosition: 0 }),
			routineWith({ id: 'b', customPosition: 5 })
		];

		const change = requireChange(planReorder(gappy, ['a', 'b'], now));

		expect(written(change)).toEqual(['b:1']);
	});

	it('leaves deleted routines out', () => {
		const routines = [
			...abc,
			routineWith({ id: 'gone', customPosition: 3, deletedAt: '2026-11-01T00:00:00.000Z' })
		];

		const change = requireChange(planReorder(routines, ['c', 'b', 'a'], now));

		expect(written(change).toSorted()).toEqual(['a:2', 'c:0']);
	});

	it('refuses ids that are not exactly the routines not deleted, each once', () => {
		const routines = [
			...abc,
			routineWith({ id: 'gone', customPosition: 3, deletedAt: '2026-11-01T00:00:00.000Z' })
		];

		expect(() => planReorder(routines, ['a', 'b'], now)).toThrow('each once');
		expect(() => planReorder(routines, ['a', 'b', 'c', 'gone'], now)).toThrow('each once');
		expect(() => planReorder(routines, ['a', 'a', 'b'], now)).toThrow('each once');
		expect(() => planReorder(routines, ['a', 'b', 'x'], now)).toThrow('each once');
	});
});
