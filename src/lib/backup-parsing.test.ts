import { describe, expect, it } from 'vitest';
import { createBackup, serializeBackup, type Backup } from './backup-format';
import { parseBackup } from './backup-parsing';
import { DEFAULT_SETTINGS } from './settings';
import { oneRoundRoutine, routineWith } from './testing/routines';
import { completedRun, firstWorkPeriod, runWith, workPeriodWith } from './testing/run-records';

/** The moment the test backups are made. */
const exportedAt = new Date('2026-11-20T10:00:00.000Z');

/** A deleted routine of two blocks, with infinite rounds, which a backup must keep. */
const deletedRoutine = routineWith({
	id: 'old',
	title: 'Old plan',
	rounds: 'infinite',
	customPosition: 1,
	deletedAt: '2026-11-18T09:00:00.000Z',
	blocks: [
		{ id: 'old-a', title: 'Write', targetMinutes: 50, breakPercent: 10, cycles: 2 },
		{ id: 'old-b', title: 'Read', targetMinutes: 30, breakPercent: 100, cycles: 1 }
	]
});

/**
 * Makes a valid backup with a test's changes on top.
 *
 * @param changes - The parts to change.
 * @returns A backup, which may no longer be valid.
 */
function backupWith(changes: Partial<Backup>): Backup {
	const valid = createBackup(
		{
			routines: [oneRoundRoutine, deletedRoutine],
			runs: [completedRun],
			workPeriods: [firstWorkPeriod],
			settings: DEFAULT_SETTINGS
		},
		exportedAt
	);
	return { ...valid, ...changes };
}

/**
 * Reads a backup that must be rejected.
 *
 * @param file - The file's contents, as an object or as text.
 * @returns The message the rejection gave.
 * @throws {@link Error} If the file is accepted.
 */
function rejectionOf(file: object | string): string {
	const result = parseBackup(typeof file === 'string' ? file : JSON.stringify(file));
	if (result.ok) {
		throw new Error('The file was accepted.');
	}
	return result.message;
}

/**
 * Copies an object without one of its fields, as a file that lacks it.
 *
 * @param object - The object to copy.
 * @param key - The field to leave out.
 * @returns The copy.
 */
function without(object: object, key: string): object {
	return Object.fromEntries(Object.entries(object).filter(([name]) => name !== key));
}

describe('parseBackup accepts', () => {
	it('a backup it made, with deleted routines, and gives back the same data', () => {
		const backup = backupWith({});

		const result = parseBackup(serializeBackup(backup));

		expect(result).toEqual({ ok: true, backup });
	});

	it('a backup with nothing in it but settings', () => {
		const backup = backupWith({ routines: [], runs: [], workPeriods: [] });

		expect(parseBackup(serializeBackup(backup))).toEqual({ ok: true, backup });
	});

	it('a run still in progress', () => {
		const backup = backupWith({ runs: [runWith({})] });

		expect(parseBackup(serializeBackup(backup))).toEqual({ ok: true, backup });
	});

	it('infinite rounds and a last routine that the file holds', () => {
		const backup = backupWith({
			settings: { ...DEFAULT_SETTINGS, lastRoutineId: 'old', theme: 'system', volume: 0 }
		});

		expect(parseBackup(serializeBackup(backup))).toEqual({ ok: true, backup });
	});

	it('a work period with a pause, whose time worked is the sum of its segments', () => {
		const paused = workPeriodWith({
			segments: [
				{ start: '2026-11-19T09:00:00.000Z', end: '2026-11-19T09:10:00.000Z' },
				{ start: '2026-11-19T09:20:00.000Z', end: '2026-11-19T09:30:00.123Z' }
			],
			workedMs: 1_200_123
		});
		const backup = backupWith({ workPeriods: [paused] });

		expect(parseBackup(serializeBackup(backup))).toEqual({ ok: true, backup });
	});

	it('a period whose block the routine no longer has, since history outlives edits', () => {
		const backup = backupWith({ workPeriods: [workPeriodWith({ blockId: 'removed' })] });

		expect(parseBackup(serializeBackup(backup)).ok).toBe(true);
	});
});

describe('parseBackup rejects a file', () => {
	it('that is not JSON', () => {
		expect(rejectionOf('not json {')).toBe('This file is not valid JSON.');
	});

	it('that is empty', () => {
		expect(rejectionOf('')).toBe('This file is not valid JSON.');
	});

	it('whose JSON is not an object', () => {
		expect(rejectionOf('[1, 2]')).toBe('The file must be an object.');
	});

	it('whose JSON is null', () => {
		expect(rejectionOf('null')).toBe('The file must be an object.');
	});

	it('that is JSON of another kind, not a Cadoro backup', () => {
		expect(rejectionOf({ name: 'package', version: '1.0.0' })).toBe(
			'This file is not a Cadoro backup.'
		);
	});

	it('with no format version', () => {
		expect(rejectionOf(without(backupWith({}), 'formatVersion'))).toBe(
			'formatVersion must be a whole number.'
		);
	});

	it('with a format version that is not a number', () => {
		expect(rejectionOf({ ...backupWith({}), formatVersion: '1' })).toBe(
			'formatVersion must be a whole number.'
		);
	});

	it('made by a newer version of the app', () => {
		expect(rejectionOf(backupWith({ formatVersion: 2 }))).toBe(
			'This backup is in format 2, made by a newer version of Cadoro. This app reads format 1. Update the app and try again.'
		);
	});

	it('in a format older than 1', () => {
		expect(rejectionOf(backupWith({ formatVersion: 0 }))).toBe("Backup format 0 isn't supported.");
	});

	it('with a missing list', () => {
		expect(rejectionOf(without(backupWith({}), 'runs'))).toBe('runs must be a list.');
	});

	it('with a list that is not a list', () => {
		expect(rejectionOf({ ...backupWith({}), routines: {} })).toBe('routines must be a list.');
	});

	it('with no settings', () => {
		expect(rejectionOf(without(backupWith({}), 'settings'))).toBe('settings must be an object.');
	});

	it('with an export time that is not a UTC timestamp', () => {
		expect(rejectionOf(backupWith({ exportedAt: 'yesterday' }))).toBe(
			'exportedAt must be a UTC timestamp such as 2026-11-19T09:30:00.000Z.'
		);
	});
});

describe('parseBackup rejects a routine', () => {
	it('that is not an object', () => {
		expect(rejectionOf({ ...backupWith({}), routines: ['x'] })).toBe(
			'routines[0] must be an object.'
		);
	});

	it('with a missing title', () => {
		const routine = without(oneRoundRoutine, 'title');

		expect(rejectionOf({ ...backupWith({}), routines: [routine] })).toBe(
			'routines[0].title must be text.'
		);
	});

	it('with a title of the wrong type', () => {
		const routine = { ...oneRoundRoutine, title: 7 };

		expect(rejectionOf({ ...backupWith({}), routines: [routine] })).toBe(
			'routines[0].title must be text.'
		);
	});

	it('with rounds that are neither a number nor infinite', () => {
		const routine = { ...oneRoundRoutine, rounds: 'forever' };

		expect(rejectionOf({ ...backupWith({}), routines: [routine] })).toBe(
			'routines[0].rounds must be a whole number.'
		);
	});

	it('with a blank title', () => {
		expect(rejectionOf(backupWith({ routines: [routineWith({ title: '   ' })] }))).toBe(
			'routines[0] has a title: Enter a title.'
		);
	});

	it('with a title over 50 characters', () => {
		const routines = [routineWith({ title: 'x'.repeat(51) })];

		expect(rejectionOf(backupWith({ routines }))).toBe(
			'routines[0] has a title: Use at most 50 characters.'
		);
	});

	it('with 100 rounds', () => {
		expect(rejectionOf(backupWith({ routines: [routineWith({ rounds: 100 })] }))).toBe(
			'routines[0] has a rounds: Enter a whole number of rounds, from 1 to 99.'
		);
	});

	it('with no blocks', () => {
		expect(rejectionOf(backupWith({ routines: [routineWith({ blocks: [] })] }))).toBe(
			'routines[0] has a blocks: Add at least 1 block.'
		);
	});

	it('with a block target of 241 minutes', () => {
		const block = { id: 'b', title: 'Focus', targetMinutes: 241, breakPercent: 20, cycles: 1 };

		expect(rejectionOf(backupWith({ routines: [routineWith({ blocks: [block] })] }))).toBe(
			'routines[0] has a block b targetMinutes: Enter a whole number of minutes, from 1 to 240.'
		);
	});

	it('with a block break of 0 percent', () => {
		const block = { id: 'b', title: 'Focus', targetMinutes: 25, breakPercent: 0, cycles: 1 };

		expect(rejectionOf(backupWith({ routines: [routineWith({ blocks: [block] })] }))).toContain(
			'breakPercent'
		);
	});

	it('with an only block of 2 cycles', () => {
		const block = { id: 'b', title: 'Focus', targetMinutes: 25, breakPercent: 20, cycles: 2 };

		expect(rejectionOf(backupWith({ routines: [routineWith({ blocks: [block] })] }))).toBe(
			'routines[0] has a block b cycles: A routine with one block has 1 cycle.'
		);
	});

	it('with a block of the wrong type', () => {
		const routine = { ...oneRoundRoutine, blocks: ['x'] };

		expect(rejectionOf({ ...backupWith({}), routines: [routine] })).toBe(
			'routines[0].blocks[0] must be an object.'
		);
	});

	it('with a block field that is not a whole number', () => {
		const block = { id: 'b', title: 'Focus', targetMinutes: 2.5, breakPercent: 20, cycles: 1 };

		expect(
			rejectionOf({ ...backupWith({}), routines: [{ ...oneRoundRoutine, blocks: [block] }] })
		).toBe('routines[0].blocks[0].targetMinutes must be a whole number.');
	});

	it('with a creation time that is not a UTC timestamp', () => {
		expect(rejectionOf(backupWith({ routines: [routineWith({ createdAt: '2026-11-19' })] }))).toBe(
			'routines[0].createdAt must be a UTC timestamp such as 2026-11-19T09:30:00.000Z.'
		);
	});

	it('with a deletion time of the wrong type', () => {
		const routine = { ...oneRoundRoutine, deletedAt: true };

		expect(rejectionOf({ ...backupWith({}), routines: [routine] })).toBe(
			'routines[0].deletedAt must be a UTC timestamp such as 2026-11-19T09:30:00.000Z.'
		);
	});

	it('with a negative custom position', () => {
		expect(rejectionOf(backupWith({ routines: [routineWith({ customPosition: -1 })] }))).toBe(
			'routines[0].customPosition must be from 0 to 9007199254740991.'
		);
	});

	it('that shares an id with another routine', () => {
		const routines = [oneRoundRoutine, routineWith({ title: 'Copy' })];

		expect(rejectionOf(backupWith({ routines }))).toBe('routines[1] repeats the id "one-round".');
	});
});

describe('parseBackup rejects a run', () => {
	it('whose routine is missing from the file', () => {
		const runs = [runWith({ routineId: 'nowhere' })];

		expect(rejectionOf(backupWith({ runs, workPeriods: [] }))).toBe(
			'runs[0] (the run "run-1", started 2026-11-19T09:00:00.000Z) refers to the routine "nowhere", which the file doesn\'t hold.'
		);
	});

	it('with an outcome that is not one of the two', () => {
		const runs = [runWith({ endedAt: '2026-11-19T09:25:00.000Z', outcome: 'abandoned' as never })];

		expect(rejectionOf(backupWith({ runs }))).toBe(
			'runs[0].outcome must be one of "completed", "finished".'
		);
	});

	it('with an end but no outcome', () => {
		const runs = [runWith({ endedAt: '2026-11-19T09:25:00.000Z' })];

		expect(rejectionOf(backupWith({ runs }))).toBe(
			'runs[0] must have both endedAt and outcome, or neither.'
		);
	});

	it('with an outcome but no end', () => {
		const runs = [runWith({ outcome: 'finished' })];

		expect(rejectionOf(backupWith({ runs }))).toBe(
			'runs[0] must have both endedAt and outcome, or neither.'
		);
	});

	it('that ends before it starts', () => {
		const runs = [runWith({ endedAt: '2026-11-19T08:00:00.000Z', outcome: 'finished' })];

		expect(rejectionOf(backupWith({ runs }))).toBe('runs[0] ends before it starts.');
	});

	it('with a negative rounds reached', () => {
		const runs = [{ ...completedRun, roundsReached: -1 }];

		expect(rejectionOf(backupWith({ runs }))).toBe(
			'runs[0].roundsReached must be from 0 to 9007199254740991.'
		);
	});

	it('with a start that is not a UTC timestamp', () => {
		const runs = [runWith({ startedAt: '19 Nov 2026' })];

		expect(rejectionOf(backupWith({ runs }))).toBe(
			'runs[0].startedAt must be a UTC timestamp such as 2026-11-19T09:30:00.000Z.'
		);
	});

	it('with a timestamp that is a real moment but not in UTC form', () => {
		const runs = [runWith({ startedAt: '2026-11-19T09:00:00+02:00' })];

		expect(rejectionOf(backupWith({ runs }))).toContain(
			'runs[0].startedAt must be a UTC timestamp'
		);
	});

	it('that shares an id with another run', () => {
		const runs = [completedRun, completedRun];

		expect(rejectionOf(backupWith({ runs }))).toBe('runs[1] repeats the id "run-1".');
	});
});

describe('parseBackup rejects a work period', () => {
	it('whose run is missing from the file', () => {
		const workPeriods = [workPeriodWith({ runId: 'no-such-run' })];

		expect(rejectionOf(backupWith({ workPeriods }))).toBe(
			'workPeriods[0] refers to the run "no-such-run", which the file doesn\'t hold.'
		);
	});

	it('whose routine is not the routine of its run', () => {
		const workPeriods = [workPeriodWith({ routineId: 'old' })];

		expect(rejectionOf(backupWith({ workPeriods }))).toBe(
			"workPeriods[0] has a routine that isn't the routine of its run."
		);
	});

	it('with no segments', () => {
		const workPeriods = [workPeriodWith({ segments: [], workedMs: 0 })];

		expect(rejectionOf(backupWith({ workPeriods }))).toBe(
			'workPeriods[0].segments must have at least one segment.'
		);
	});

	it('with a segment that ends before it starts', () => {
		const workPeriods = [
			workPeriodWith({
				segments: [{ start: '2026-11-19T09:25:00.000Z', end: '2026-11-19T09:00:00.000Z' }]
			})
		];

		expect(rejectionOf(backupWith({ workPeriods }))).toBe(
			'workPeriods[0].segments[0] ends before it starts.'
		);
	});

	it('with a segment that is not an object', () => {
		const period = { ...firstWorkPeriod, segments: [5] };

		expect(rejectionOf({ ...backupWith({}), workPeriods: [period] })).toBe(
			'workPeriods[0].segments[0] must be an object.'
		);
	});

	it('with a segment time that is not a UTC timestamp', () => {
		const period = { ...firstWorkPeriod, segments: [{ start: 'nine', end: 'ten' }] };

		expect(rejectionOf({ ...backupWith({}), workPeriods: [period] })).toBe(
			'workPeriods[0].segments[0].start must be a UTC timestamp such as 2026-11-19T09:30:00.000Z.'
		);
	});

	it('whose time worked is not the sum of its segments', () => {
		const workPeriods = [workPeriodWith({ workedMs: 1_000 })];

		expect(rejectionOf(backupWith({ workPeriods }))).toBe(
			'workPeriods[0].workedMs must be the sum of the segments, 1500000.'
		);
	});

	it('with a time worked that is not a number', () => {
		const period = { ...firstWorkPeriod, workedMs: '1500000' };

		expect(rejectionOf({ ...backupWith({}), workPeriods: [period] })).toBe(
			'workPeriods[0].workedMs must be a number, 0 or more.'
		);
	});

	it('with a negative time worked', () => {
		const workPeriods = [workPeriodWith({ workedMs: -5 })];

		expect(rejectionOf(backupWith({ workPeriods }))).toBe(
			'workPeriods[0].workedMs must be a number, 0 or more.'
		);
	});

	it('with a target over 240 minutes', () => {
		const workPeriods = [workPeriodWith({ targetMinutes: 241 })];

		expect(rejectionOf(backupWith({ workPeriods }))).toBe(
			'workPeriods[0].targetMinutes must be from 1 to 240.'
		);
	});

	it('with a missing block', () => {
		const period = without(firstWorkPeriod, 'blockId');

		expect(rejectionOf({ ...backupWith({}), workPeriods: [period] })).toBe(
			'workPeriods[0].blockId must be text.'
		);
	});

	it('that shares an id with another work period', () => {
		const workPeriods = [firstWorkPeriod, firstWorkPeriod];

		expect(rejectionOf(backupWith({ workPeriods }))).toBe(
			'workPeriods[1] repeats the id "period-1".'
		);
	});
});

describe('parseBackup rejects settings', () => {
	it('with a theme that is not one of the three', () => {
		const settings = { ...DEFAULT_SETTINGS, theme: 'neon' };

		expect(rejectionOf({ ...backupWith({}), settings })).toBe(
			'settings.theme must be one of "system", "light", "dark".'
		);
	});

	it('with a volume of 101', () => {
		const settings = { ...DEFAULT_SETTINGS, volume: 101 };

		expect(rejectionOf({ ...backupWith({}), settings })).toBe(
			'settings.volume must be from 0 to 100.'
		);
	});

	it('with a keep-awake setting that is not true or false', () => {
		const settings = { ...DEFAULT_SETTINGS, keepScreenAwake: 'yes' };

		expect(rejectionOf({ ...backupWith({}), settings })).toBe(
			'settings.keepScreenAwake must be true or false.'
		);
	});

	it('with a chime that is not text', () => {
		const settings = { ...DEFAULT_SETTINGS, targetChime: null };

		expect(rejectionOf({ ...backupWith({}), settings })).toBe('settings.targetChime must be text.');
	});

	it('with a sort order it does not know', () => {
		const settings = { ...DEFAULT_SETTINGS, routineSort: 'random' };

		expect(rejectionOf({ ...backupWith({}), settings })).toContain(
			'settings.routineSort must be one of "custom"'
		);
	});

	it('with a missing last routine field', () => {
		const settings = without(DEFAULT_SETTINGS, 'lastRoutineId');

		expect(rejectionOf({ ...backupWith({}), settings })).toBe(
			'settings.lastRoutineId must be text or null.'
		);
	});

	it('whose last routine is missing from the file', () => {
		const settings = { ...DEFAULT_SETTINGS, lastRoutineId: 'nowhere' };

		expect(rejectionOf(backupWith({ settings }))).toBe(
			'settings.lastRoutineId refers to the routine "nowhere", which the file doesn\'t hold.'
		);
	});
});
