import { describe, expect, it } from 'vitest';
import { createBackup, serializeBackup } from './backup-format';
import { parseBackup } from './backup-parsing';
import { requireDefined } from './defined';
import { DEFAULT_SETTINGS } from './settings';
import type { Routine } from './routine';
import { recordPress, workPeriodsOldestFirst, type Run, type RunRecords } from './run-records';
import { createRun, finish, next, pause, play, type RunState } from './run';
import { minutes, seconds } from './testing/durations';
import { numberedIds } from './testing/ids';
import { at } from './testing/moments';
import { firstWorkPeriod, workPeriodWith } from './testing/run-records';
import { oneRoundRoutine, routineWith } from './testing/routines';

/** A button's effect on a run, such as `play`, from the run engine. */
type Button = (run: RunState, now: number) => RunState;

/** What a press that changes nothing that's kept leaves to save. */
const nothing: RunRecords = { run: null, workPeriods: [] };

/** Classic's one block, repeating forever, so Next always starts a break. */
const foreverRoutine = routineWith({ rounds: 'infinite' });

/**
 * Starts a run of a routine that presses buttons one after another, as the timer session does,
 * keeping the run and its record between presses.
 *
 * @param routine - The routine to run.
 * @returns A function that presses a button at a moment and gives what that press saves. Ids are
 * numbered from `id-1` in the order they're made.
 */
function runOf(routine: Routine): (button: Button, now: number) => RunRecords {
	const newId = numberedIds();
	let run: RunState = createRun(routine);
	let record: Run | null = null;

	return (button, now) => {
		const after = button(run, now);
		const records = recordPress({ before: run, after, now, routineId: routine.id, record }, newId);
		run = after;
		record = records.run ?? record;
		return records;
	};
}

describe('recordPress', () => {
	it('starts a run record when Play starts a ready run', () => {
		const press = runOf(oneRoundRoutine);

		expect(press(play, at('09:00:00.000'))).toEqual({
			run: {
				id: 'id-1',
				routineId: 'one-round',
				startedAt: '2026-11-19T09:00:00.000Z',
				endedAt: null,
				outcome: null,
				roundsReached: 0
			},
			workPeriods: []
		});
	});

	it('saves nothing when Pause stops work or Play resumes it', () => {
		const press = runOf(oneRoundRoutine);
		press(play, at('09:00:00.000'));

		expect(press(pause, at('09:10:00.000'))).toEqual(nothing);
		expect(press(play, at('09:15:00.000'))).toEqual(nothing);
	});

	it('saves the work period Next ends, with its block, target, unpaused stretches and exact time worked', () => {
		const press = runOf(foreverRoutine);
		press(play, at('09:00:00.000'));
		press(pause, at('09:10:00.000'));
		press(play, at('09:15:00.000'));

		expect(press(next, at('09:30:00.250'))).toEqual({
			run: null,
			workPeriods: [
				{
					id: 'id-2',
					runId: 'id-1',
					routineId: 'one-round',
					blockId: 'one-round-focus',
					targetMinutes: 25,
					segments: [
						{ start: '2026-11-19T09:00:00.000Z', end: '2026-11-19T09:10:00.000Z' },
						{ start: '2026-11-19T09:15:00.000Z', end: '2026-11-19T09:30:00.250Z' }
					],
					workedMs: minutes(25) + 250
				}
			]
		});
	});

	it('saves nothing when a break ends, by Next or by Play once it is over', () => {
		const press = runOf(foreverRoutine);
		press(play, at('09:00:00.000'));
		press(next, at('09:25:00.000'));

		expect(press(next, at('09:26:00.000'))).toEqual(nothing);

		press(next, at('09:51:00.000'));
		expect(press(play, at('09:57:00.000'))).toEqual(nothing);
	});

	it('ends the run as finished, saving the work so far, when Finish is pressed mid-work', () => {
		const press = runOf(foreverRoutine);
		press(play, at('09:00:00.000'));

		expect(press(finish, at('09:12:30.000'))).toEqual({
			run: {
				id: 'id-1',
				routineId: 'one-round',
				startedAt: '2026-11-19T09:00:00.000Z',
				endedAt: '2026-11-19T09:12:30.000Z',
				outcome: 'finished',
				roundsReached: 1
			},
			workPeriods: [
				{
					id: 'id-2',
					runId: 'id-1',
					routineId: 'one-round',
					blockId: 'one-round-focus',
					targetMinutes: 25,
					segments: [{ start: '2026-11-19T09:00:00.000Z', end: '2026-11-19T09:12:30.000Z' }],
					workedMs: minutes(12) + seconds(30)
				}
			]
		});
	});

	it('ends the run as finished, with no work period, when Finish is pressed during a break', () => {
		const press = runOf(foreverRoutine);
		press(play, at('09:00:00.000'));
		press(next, at('09:25:00.000'));

		expect(press(finish, at('09:27:00.000'))).toEqual({
			run: {
				id: 'id-1',
				routineId: 'one-round',
				startedAt: '2026-11-19T09:00:00.000Z',
				endedAt: '2026-11-19T09:27:00.000Z',
				outcome: 'finished',
				roundsReached: 1
			},
			workPeriods: []
		});
	});

	it("ends the run as completed, with the rounds it reached, when a finite routine's last work period ends", () => {
		const press = runOf(routineWith({ rounds: 2 }));
		press(play, at('09:00:00.000'));
		press(next, at('09:25:00.000'));
		press(next, at('09:26:00.000'));

		const records = press(next, at('09:51:00.000'));

		expect(records.run).toEqual({
			id: 'id-1',
			routineId: 'one-round',
			startedAt: '2026-11-19T09:00:00.000Z',
			endedAt: '2026-11-19T09:51:00.000Z',
			outcome: 'completed',
			roundsReached: 2
		});
		expect(records.workPeriods).toEqual([
			expect.objectContaining({
				id: 'id-3',
				runId: 'id-1',
				segments: [{ start: '2026-11-19T09:26:00.000Z', end: '2026-11-19T09:51:00.000Z' }],
				workedMs: minutes(25)
			})
		]);
	});

	it('ends the run no earlier than it started when the clock moved back before Finish', () => {
		const press = runOf(foreverRoutine);
		press(play, at('09:00:00.000'));

		const records = press(finish, at('08:59:00.000'));

		expect(records.run).toMatchObject({
			startedAt: '2026-11-19T09:00:00.000Z',
			endedAt: '2026-11-19T09:00:00.000Z'
		});
		expect(records.workPeriods).toEqual([
			expect.objectContaining({
				segments: [{ start: '2026-11-19T09:00:00.000Z', end: '2026-11-19T09:00:00.000Z' }],
				workedMs: 0
			})
		]);
	});

	it('makes records that a backup of them reads back after the clock moved back before Finish', () => {
		const press = runOf(foreverRoutine);
		press(play, at('09:00:00.000'));
		const records = press(finish, at('08:59:00.000'));
		const backup = serializeBackup(
			createBackup(
				{
					routines: [foreverRoutine],
					runs: [requireDefined(records.run ?? undefined, 'the ended run')],
					workPeriods: records.workPeriods,
					settings: DEFAULT_SETTINGS
				},
				new Date(at('10:00:00.000'))
			)
		);

		expect(parseBackup(backup)).toMatchObject({ ok: true });
	});

	it('records the block and target each work period ran with', () => {
		const press = runOf(
			routineWith({
				blocks: [
					{ id: 'warm-up', title: 'Warm up', targetMinutes: 10, breakPercent: 20, cycles: 1 },
					{ id: 'deep-work', title: 'Deep work', targetMinutes: 50, breakPercent: 20, cycles: 1 }
				]
			})
		);
		press(play, at('09:00:00.000'));

		const warmUp = press(next, at('09:10:00.000'));
		press(next, at('09:12:00.000'));
		const deepWork = press(next, at('10:02:00.000'));

		expect(warmUp.workPeriods).toEqual([
			expect.objectContaining({ blockId: 'warm-up', targetMinutes: 10 })
		]);
		expect(deepWork.workPeriods).toEqual([
			expect.objectContaining({ blockId: 'deep-work', targetMinutes: 50 })
		]);
	});

	it('saves nothing for a press that changes nothing, such as Next before Play', () => {
		const press = runOf(oneRoundRoutine);

		expect(press(next, at('09:00:00.000'))).toEqual(nothing);
	});

	it('throws when a press ends work but the run has no record', () => {
		const before = play(createRun(foreverRoutine), at('09:00:00.000'));
		const after = next(before, at('09:25:00.000'));

		expect(() =>
			recordPress(
				{ before, after, now: at('09:25:00.000'), routineId: 'one-round', record: null },
				numberedIds()
			)
		).toThrow('A run must have a record before its work can be saved.');
	});
});

describe('workPeriodsOldestFirst', () => {
	it('throws when a work period has no segments', () => {
		const withoutSegments = workPeriodWith({ segments: [] });

		expect(() => workPeriodsOldestFirst([firstWorkPeriod, withoutSegments])).toThrow(
			"Expected the work period's first segment to exist"
		);
	});
});
