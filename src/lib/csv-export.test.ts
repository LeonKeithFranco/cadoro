import { describe, expect, it } from 'vitest';
import { workPeriodsToCsv } from './csv-export';
import { firstWorkPeriod, workPeriodWith } from './testing/run-records';
import { oneRoundRoutine, routineWith } from './testing/routines';

/** The CSV's header row, with its line break. */
const header = 'routine,block,started_at,ended_at,worked_seconds,target_minutes\r\n';

describe('workPeriodsToCsv', () => {
	it('gives only the header row when there are no work periods', () => {
		expect(workPeriodsToCsv([oneRoundRoutine], [])).toBe(header);
	});

	it('gives one row per work period with the routine, block, times, seconds and target', () => {
		const csv = workPeriodsToCsv([oneRoundRoutine], [firstWorkPeriod]);

		expect(csv).toBe(
			header + 'One round,Focus,2026-11-19T09:00:00.000Z,2026-11-19T09:25:00.000Z,1500,25\r\n'
		);
	});

	it('runs from the first segment start to the last segment end, with the worked time between', () => {
		const paused = workPeriodWith({
			segments: [
				{ start: '2026-11-19T09:00:00.000Z', end: '2026-11-19T09:10:00.000Z' },
				{ start: '2026-11-19T09:20:00.000Z', end: '2026-11-19T09:30:00.500Z' }
			],
			workedMs: 1_200_500
		});

		expect(workPeriodsToCsv([oneRoundRoutine], [paused])).toBe(
			header + 'One round,Focus,2026-11-19T09:00:00.000Z,2026-11-19T09:30:00.500Z,1200.5,25\r\n'
		);
	});

	it('keeps worked time to the millisecond, as fractions of a second', () => {
		const odd = workPeriodWith({ workedMs: 1234 });

		expect(workPeriodsToCsv([oneRoundRoutine], [odd])).toContain(',1.234,');
	});

	it('writes the target the period ran with, not the block current target', () => {
		const earlier = workPeriodWith({ targetMinutes: 50 });

		expect(workPeriodsToCsv([oneRoundRoutine], [earlier])).toMatch(/,50\r\n$/);
	});

	it('lists the rows oldest first', () => {
		const later = workPeriodWith({
			id: 'period-2',
			segments: [{ start: '2026-11-19T11:00:00.000Z', end: '2026-11-19T11:25:00.000Z' }]
		});

		const lines = workPeriodsToCsv([oneRoundRoutine], [later, firstWorkPeriod]).split('\r\n');

		expect(lines[1]).toContain('2026-11-19T09:00:00.000Z');
		expect(lines[2]).toContain('2026-11-19T11:00:00.000Z');
	});

	it('finds the title of a deleted routine', () => {
		const deleted = routineWith({ deletedAt: '2026-11-18T09:00:00.000Z', title: 'Old plan' });

		expect(workPeriodsToCsv([deleted], [firstWorkPeriod])).toContain('Old plan,Focus,');
	});

	it('leaves the routine and block empty when they no longer exist', () => {
		const orphan = workPeriodWith({ routineId: 'gone', blockId: 'gone-block' });

		expect(workPeriodsToCsv([oneRoundRoutine], [orphan])).toContain(
			'\r\n,,2026-11-19T09:00:00.000Z,'
		);
	});

	it('leaves the block empty when the routine no longer has it', () => {
		const orphan = workPeriodWith({ blockId: 'removed-block' });

		expect(workPeriodsToCsv([oneRoundRoutine], [orphan])).toContain('\r\nOne round,,2026');
	});

	it.each([
		{ title: 'Write, then read', quoted: '"Write, then read"' },
		{ title: 'The "deep" one', quoted: '"The ""deep"" one"' },
		{ title: 'Two\nlines', quoted: '"Two\nlines"' },
		{ title: 'Two\rlines', quoted: '"Two\rlines"' }
	])('quotes the title $title as $quoted', ({ title, quoted }) => {
		const routine = routineWith({ title });

		expect(workPeriodsToCsv([routine], [firstWorkPeriod])).toContain(`\r\n${quoted},Focus,`);
	});

	it('quotes a block title with a comma', () => {
		const routine = routineWith({
			blocks: [
				{
					id: 'one-round-focus',
					title: 'Focus, hard',
					targetMinutes: 25,
					breakPercent: 20,
					cycles: 1
				}
			]
		});

		expect(workPeriodsToCsv([routine], [firstWorkPeriod])).toContain('One round,"Focus, hard",');
	});

	it.each(['=1+1', '+1', '-1', '@SUM(A1)', '\tTabbed'])(
		'starts a routine title that begins like a formula, %j, with a single quote',
		(title) => {
			const routine = routineWith({ title });

			expect(workPeriodsToCsv([routine], [firstWorkPeriod])).toContain(`\r\n'${title},Focus,`);
		}
	);

	it('starts a title that begins with a carriage return with a single quote, inside quotes', () => {
		const routine = routineWith({ title: '\rLine' });

		expect(workPeriodsToCsv([routine], [firstWorkPeriod])).toContain('\r\n"\'\rLine",Focus,');
	});

	it('starts a block title that begins like a formula with a single quote', () => {
		const routine = routineWith({
			blocks: [
				{
					id: 'one-round-focus',
					title: '=HYPERLINK("x")',
					targetMinutes: 25,
					breakPercent: 20,
					cycles: 1
				}
			]
		});

		expect(workPeriodsToCsv([routine], [firstWorkPeriod])).toContain(
			'One round,"\'=HYPERLINK(""x"")",'
		);
	});

	it('leaves the numbers and timestamps as they are', () => {
		const row = workPeriodsToCsv([oneRoundRoutine], [firstWorkPeriod]).split('\r\n')[1];

		expect(row).not.toContain("'");
	});

	it('leaves a plain title unquoted', () => {
		expect(workPeriodsToCsv([oneRoundRoutine], [firstWorkPeriod])).not.toContain('"');
	});
});
