import { describe, expect, it } from 'vitest';
import { requireDefined } from './defined';
import { copyTitle, duplicateRoutine } from './routine-duplication';
import { validateRoutine } from './routine-validation';
import { numberedIds } from './testing/ids';
import { routineWith } from './testing/routines';

/** The moment every copy is made at. */
const now = new Date('2026-03-02T10:00:00.000Z');

describe('copyTitle', () => {
	it('adds " (copy)" after the title', () => {
		expect(copyTitle('Writing')).toBe('Writing (copy)');
	});

	it('adds another when the title is already a copy', () => {
		expect(copyTitle('Writing (copy)')).toBe('Writing (copy) (copy)');
	});

	it('keeps a title of 43 characters whole, which makes exactly 50', () => {
		const title = 'a'.repeat(43);

		expect(copyTitle(title)).toBe(`${title} (copy)`);
		expect(copyTitle(title)).toHaveLength(50);
	});

	it('cuts a title of 44 or more characters so the copy stays within 50', () => {
		expect(copyTitle('a'.repeat(44))).toBe(`${'a'.repeat(43)} (copy)`);
		expect(copyTitle('a'.repeat(50))).toBe(`${'a'.repeat(43)} (copy)`);
	});

	it('drops spaces left at the cut, so the copy has no double space', () => {
		const title = `${'a'.repeat(42)}  tail`;

		expect(copyTitle(title)).toBe(`${'a'.repeat(42)} (copy)`);
	});
});

describe('duplicateRoutine', () => {
	const original = routineWith({
		id: 'original',
		title: 'Deep work',
		rounds: 3,
		blocks: [
			{ id: 'b1', title: 'Focus', targetMinutes: 50, breakPercent: 30, cycles: 2 },
			{ id: 'b2', title: 'Review', targetMinutes: 10, breakPercent: 10, cycles: 1 }
		],
		customPosition: 4,
		createdAt: '2026-01-01T00:00:00.000Z'
	});

	it('names the copy after the original', () => {
		expect(duplicateRoutine(original, now, numberedIds()).title).toBe('Deep work (copy)');
	});

	it('gives the copy and each of its blocks a new id from the generator', () => {
		const copy = duplicateRoutine(original, now, numberedIds());

		expect(copy.id).toBe('id-1');
		expect(copy.blocks.map((block) => block.id)).toEqual(['id-2', 'id-3']);
	});

	it('keeps the rounds and the blocks fields, in order', () => {
		const copy = duplicateRoutine(original, now, numberedIds());

		expect(copy.rounds).toBe(3);
		expect(copy.blocks).toEqual([
			{ id: 'id-2', title: 'Focus', targetMinutes: 50, breakPercent: 30, cycles: 2 },
			{ id: 'id-3', title: 'Review', targetMinutes: 10, breakPercent: 10, cycles: 1 }
		]);
	});

	it('keeps infinite rounds', () => {
		const copy = duplicateRoutine(routineWith({ rounds: 'infinite' }), now, numberedIds());

		expect(copy.rounds).toBe('infinite');
	});

	it('creates the copy now and not deleted, even from a deleted original', () => {
		const deleted = routineWith({
			createdAt: '2026-01-01T00:00:00.000Z',
			deletedAt: '2026-02-01T00:00:00.000Z'
		});

		const copy = duplicateRoutine(deleted, now, numberedIds());

		expect(copy.createdAt).toBe('2026-03-02T10:00:00.000Z');
		expect(copy.deletedAt).toBeNull();
	});

	it('keeps the original custom position, for the caller to place the copy', () => {
		expect(duplicateRoutine(original, now, numberedIds()).customPosition).toBe(4);
	});

	it('leaves the original as it was, and shares none of its blocks', () => {
		const copy = duplicateRoutine(original, now, numberedIds());
		requireDefined(copy.blocks[0], 'the first copied block').targetMinutes = 99;

		expect(original.blocks[0]?.targetMinutes).toBe(50);
		expect(original.title).toBe('Deep work');
	});

	it('makes a valid copy of a routine with a 50-character title', () => {
		const copy = duplicateRoutine(routineWith({ title: 'a'.repeat(50) }), now, numberedIds());

		expect(validateRoutine(copy).title).toBeUndefined();
	});
});
