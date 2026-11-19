import './testing/time-zone';
import { describe, expect, it } from 'vitest';
import { routineWith } from './testing/routines';
import { workPeriodWith } from './testing/run-records';
import { minutes } from './testing/durations';
import { viewStats, type StatsInput } from './stats-view';

/**
 * Makes a work period of one unpaused segment, so a test writes just its routine, start, length
 * and target.
 *
 * @param routineId - The routine it belongs to.
 * @param start - When it started, as a UTC timestamp.
 * @param end - When it ended, as a UTC timestamp.
 * @param workedMinutes - The minutes between them, which is also its time worked.
 * @param targetMinutes - Its target in minutes.
 * @returns The work period.
 */
function period(
	routineId: string,
	start: string,
	end: string,
	workedMinutes: number,
	targetMinutes: number
): ReturnType<typeof workPeriodWith> {
	return workPeriodWith({
		routineId,
		targetMinutes,
		segments: [{ start, end }],
		workedMs: minutes(workedMinutes)
	});
}

/** The routines of the data below. */
const routines = [
	routineWith({ id: 'focus', title: 'Focus' }),
	routineWith({ id: 'reading', title: 'Reading' })
];

/**
 * Work in New York time: Sat Oct 31 10:00 (10 of 25 minutes), Wed Nov 18 10:00 (25 of 25) and
 * Thu Nov 19 10:00 (30 of 25) in Focus, and Thu Nov 19 11:00 (40 of 50) in Reading.
 */
const workPeriods = [
	period('focus', '2026-10-31T15:00:00.000Z', '2026-10-31T15:10:00.000Z', 10, 25),
	period('focus', '2026-11-18T15:00:00.000Z', '2026-11-18T15:25:00.000Z', 25, 25),
	period('focus', '2026-11-19T15:00:00.000Z', '2026-11-19T15:30:00.000Z', 30, 25),
	period('reading', '2026-11-19T16:00:00.000Z', '2026-11-19T16:40:00.000Z', 40, 50)
];

/** Thursday Nov 19 2026, 15:00 in New York. */
const NOW = Date.parse('2026-11-19T20:00:00Z');

/**
 * Views the stats of the data above, changing only what a test says.
 *
 * @param changes - The parts of the input that differ.
 * @returns The view.
 */
function view(changes: Partial<StatsInput>): ReturnType<typeof viewStats> {
	return viewStats({ workPeriods, routines, routineId: null, preset: '7d', now: NOW, ...changes });
}

describe('viewStats for every routine', () => {
	const shown = view({});

	it('shows the work done today', () => {
		expect(shown.today).toBe('1:10:00');
	});

	it('shows the streaks', () => {
		expect(shown.currentStreak).toBe('2 days');
		expect(shown.longestStreak).toBe('2 days');
	});

	it('shows time against target as total worked over total target: 105 of 125 minutes', () => {
		expect(shown.timeAgainstTarget).toBe('84%');
	});

	it('shows the share of periods that reached their target: 2 of 4', () => {
		expect(shown.targetsReached).toBe('50%');
	});

	it('shows a bar for each of the last 7 days, today included, in minutes', () => {
		expect(shown.days).toHaveLength(7);
		expect(shown.days[0]).toEqual({
			day: '2026-11-13',
			label: 'Nov 13',
			minutes: 0,
			duration: '0:00'
		});
		expect(shown.days.map((bar) => bar.minutes)).toEqual([0, 0, 0, 0, 0, 25, 70]);
		expect(shown.days[6]).toEqual({
			day: '2026-11-19',
			label: 'Nov 19',
			minutes: 70,
			duration: '1:10:00'
		});
	});

	it('lists the weeks with work, newest first, each starting on a Monday', () => {
		expect(shown.weeks.map((row) => [row.label, row.duration])).toEqual([
			['Week of Nov 16, 2026', '1:35:00'],
			['Week of Oct 26, 2026', '10:00']
		]);
	});

	it('lists the months with work, newest first', () => {
		expect(shown.months.map((row) => [row.label, row.duration])).toEqual([
			['November 2026', '1:35:00'],
			['October 2026', '10:00']
		]);
	});

	it('shows all time overall and per routine, most worked first', () => {
		expect(shown.allTime).toBe('1:45:00');
		expect(shown.routineTotals).toEqual([
			{ key: 'focus', label: 'Focus', duration: '1:05:00' },
			{ key: 'reading', label: 'Reading', duration: '40:00' }
		]);
	});

	it('has work', () => {
		expect(shown.hasWork).toBe(true);
	});
});

describe('viewStats ranges', () => {
	it('draws 30 days back from today, with the 10 minutes of Oct 31 in its eleventh bar', () => {
		const shown = view({ preset: '30d' });

		expect(shown.days).toHaveLength(30);
		expect(shown.days[0]?.day).toBe('2026-10-21');
		expect(shown.days[10]).toMatchObject({ day: '2026-10-31', minutes: 10 });
	});

	it('draws "all" from the first day with work: 20 days from Oct 31 to Nov 19', () => {
		const shown = view({ preset: 'all' });

		expect(shown.days).toHaveLength(20);
		expect(shown.days[0]?.day).toBe('2026-10-31');
	});
});

describe('viewStats for one routine', () => {
	const shown = view({ routineId: 'focus' });

	it('narrows every figure to that routine', () => {
		expect(shown.today).toBe('30:00');
		expect(shown.currentStreak).toBe('2 days');
		expect(shown.timeAgainstTarget).toBe('87%');
		expect(shown.targetsReached).toBe('67%');
		expect(shown.days.map((bar) => bar.minutes)).toEqual([0, 0, 0, 0, 0, 25, 30]);
		expect(shown.weeks[0]).toMatchObject({ label: 'Week of Nov 16, 2026', duration: '55:00' });
		expect(shown.months[0]).toMatchObject({ label: 'November 2026', duration: '55:00' });
		expect(shown.allTime).toBe('1:05:00');
		expect(shown.routineTotals).toEqual([{ key: 'focus', label: 'Focus', duration: '1:05:00' }]);
	});

	it('still has work when the routine has none', () => {
		const empty = view({ routineId: 'nothing' });

		expect(empty.hasWork).toBe(true);
		expect(empty.today).toBe('0:00');
		expect(empty.timeAgainstTarget).toBe('-');
		expect(empty.routineTotals).toEqual([]);
	});
});

describe('viewStats with no work', () => {
	const shown = view({ workPeriods: [] });

	it('has no work and shows zeros and dashes', () => {
		expect(shown.hasWork).toBe(false);
		expect(shown.today).toBe('0:00');
		expect(shown.currentStreak).toBe('0 days');
		expect(shown.longestStreak).toBe('0 days');
		expect(shown.timeAgainstTarget).toBe('-');
		expect(shown.targetsReached).toBe('-');
		expect(shown.allTime).toBe('0:00');
		expect(shown.weeks).toEqual([]);
		expect(shown.months).toEqual([]);
	});
});

describe('viewStats with a deleted routine', () => {
	it('names the routine and marks it as deleted', () => {
		const old = routineWith({
			id: 'old',
			title: 'Old routine',
			deletedAt: '2026-11-01T12:00:00.000Z'
		});
		const shown = view({
			routines: [...routines, old],
			workPeriods: [period('old', '2026-11-19T15:00:00.000Z', '2026-11-19T15:05:00.000Z', 5, 25)]
		});

		expect(shown.routineTotals).toEqual([
			{ key: 'old', label: 'Old routine (deleted)', duration: '5:00' }
		]);
	});
});

describe('viewStats with a work period in progress', () => {
	/** 20 minutes of Focus today, still going, with a 25 minute target. */
	const inProgress = period(
		'focus',
		'2026-11-19T18:00:00.000Z',
		'2026-11-19T18:20:00.000Z',
		20,
		25
	);

	it('counts its work in today, the chart, the totals and the streak', () => {
		const shown = view({ workInProgress: inProgress });

		expect(shown.today).toBe('1:30:00');
		expect(shown.days.map((bar) => bar.minutes)).toEqual([0, 0, 0, 0, 0, 25, 90]);
		expect(shown.weeks[0]).toMatchObject({ duration: '1:55:00' });
		expect(shown.months[0]).toMatchObject({ duration: '1:55:00' });
		expect(shown.allTime).toBe('2:05:00');
		expect(shown.routineTotals[0]).toEqual({ key: 'focus', label: 'Focus', duration: '1:25:00' });
	});

	it('leaves it out of the target figures, since it has not ended', () => {
		const shown = view({ workInProgress: inProgress });

		expect(shown.timeAgainstTarget).toBe('84%');
		expect(shown.targetsReached).toBe('50%');
	});

	it('is left out when the routine filter is another routine', () => {
		const shown = view({ routineId: 'reading', workInProgress: inProgress });

		expect(shown.today).toBe('40:00');
	});

	it('makes the work show, even with no work saved', () => {
		const shown = view({ workPeriods: [], workInProgress: inProgress });

		expect(shown.hasWork).toBe(true);
		expect(shown.today).toBe('20:00');
		expect(shown.currentStreak).toBe('1 day');
	});
});

describe('viewStats singular days', () => {
	it('says 1 day for a streak of one', () => {
		const shown = view({
			workPeriods: [period('focus', '2026-11-19T15:00:00.000Z', '2026-11-19T15:05:00.000Z', 5, 25)]
		});

		expect(shown.currentStreak).toBe('1 day');
	});
});
