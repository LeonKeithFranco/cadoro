import { describe, expect, it } from 'vitest';
import { allTimeTotals, filterByRoutine, workedMsByRoutine } from './routine-stats';
import { minutes } from './testing/durations';
import { routineWith } from './testing/routines';
import { workPeriodWith } from './testing/run-records';

/** A routine that's still in use. */
const focus = routineWith({ id: 'focus', title: 'Focus' });
/** A second routine that's still in use. */
const reading = routineWith({ id: 'reading', title: 'Reading' });
/** A routine that was deleted, so it's hidden but its work is kept. */
const oldRoutine = routineWith({
	id: 'old',
	title: 'Old routine',
	deletedAt: '2026-11-01T12:00:00.000Z'
});

describe('filterByRoutine', () => {
	const periods = [
		workPeriodWith({ id: 'a', routineId: 'focus' }),
		workPeriodWith({ id: 'b', routineId: 'reading' }),
		workPeriodWith({ id: 'c', routineId: 'focus' })
	];

	it('keeps every work period when no routine is chosen', () => {
		expect(filterByRoutine(periods, null)).toEqual(periods);
	});

	it("keeps only the chosen routine's work periods, in order", () => {
		expect(filterByRoutine(periods, 'focus').map((period) => period.id)).toEqual(['a', 'c']);
	});

	it('gives nothing for a routine without work', () => {
		expect(filterByRoutine(periods, 'unknown')).toEqual([]);
	});
});

describe('workedMsByRoutine', () => {
	it("adds up each routine's work, by routine id", () => {
		const periods = [
			workPeriodWith({ routineId: 'focus', workedMs: minutes(25) }),
			workPeriodWith({ routineId: 'reading', workedMs: minutes(60) }),
			workPeriodWith({ routineId: 'focus', workedMs: minutes(10) })
		];

		expect(workedMsByRoutine(periods)).toEqual(
			new Map([
				['focus', minutes(35)],
				['reading', minutes(60)]
			])
		);
	});

	it('has no entry for a routine without work', () => {
		expect(workedMsByRoutine([])).toEqual(new Map());
	});
});

describe('allTimeTotals', () => {
	it('gives 0 and no routines when there is no work', () => {
		expect(allTimeTotals([], [focus])).toEqual({ workedMs: 0, perRoutine: [] });
	});

	it('adds up the total and each routine, most worked first', () => {
		const periods = [
			workPeriodWith({ routineId: 'focus', workedMs: minutes(25) }),
			workPeriodWith({ routineId: 'reading', workedMs: minutes(60) }),
			workPeriodWith({ routineId: 'focus', workedMs: minutes(10) })
		];

		expect(allTimeTotals(periods, [focus, reading])).toEqual({
			workedMs: minutes(95),
			perRoutine: [
				{ routineId: 'reading', title: 'Reading', deleted: false, workedMs: minutes(60) },
				{ routineId: 'focus', title: 'Focus', deleted: false, workedMs: minutes(35) }
			]
		});
	});

	it('includes a deleted routine, marked as deleted, under its title', () => {
		const periods = [workPeriodWith({ routineId: 'old', workedMs: minutes(40) })];

		expect(allTimeTotals(periods, [focus, oldRoutine]).perRoutine).toEqual([
			{ routineId: 'old', title: 'Old routine', deleted: true, workedMs: minutes(40) }
		]);
	});

	it('leaves out a routine with no work', () => {
		const periods = [workPeriodWith({ routineId: 'focus', workedMs: minutes(5) })];

		expect(allTimeTotals(periods, [focus, reading]).perRoutine).toHaveLength(1);
	});

	it('lists routines with equal work by title', () => {
		const periods = [
			workPeriodWith({ routineId: 'reading', workedMs: minutes(5) }),
			workPeriodWith({ routineId: 'focus', workedMs: minutes(5) })
		];

		const titles = allTimeTotals(periods, [reading, focus]).perRoutine.map((total) => total.title);

		expect(titles).toEqual(['Focus', 'Reading']);
	});

	it('counts work by a routine missing from the list in the total only', () => {
		const periods = [
			workPeriodWith({ routineId: 'focus', workedMs: minutes(5) }),
			workPeriodWith({ routineId: 'missing', workedMs: minutes(7) })
		];

		const totals = allTimeTotals(periods, [focus]);

		expect(totals.workedMs).toBe(minutes(12));
		expect(totals.perRoutine.map((total) => total.routineId)).toEqual(['focus']);
	});
});
