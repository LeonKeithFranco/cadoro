import './testing/time-zone';
import { describe, expect, it } from 'vitest';
import { createBackup } from './backup-format';
import { describeBackupSummary, summarizeBackup, type BackupSummary } from './backup-summary';
import { DEFAULT_SETTINGS } from './settings';
import { oneRoundRoutine, routineWith } from './testing/routines';
import { firstWorkPeriod, runWith } from './testing/run-records';

/** The moment the test backups are made. */
const now = new Date('2026-11-20T10:00:00.000Z');

describe('summarizeBackup', () => {
	it('counts the routines, runs and work periods and gives the format and export time', () => {
		const deleted = routineWith({ id: 'old', deletedAt: '2026-11-18T09:00:00.000Z' });
		const backup = createBackup(
			{
				routines: [oneRoundRoutine, deleted],
				runs: [runWith({ id: 'run-1' })],
				workPeriods: [firstWorkPeriod],
				settings: DEFAULT_SETTINGS
			},
			now
		);

		expect(summarizeBackup(backup)).toEqual({
			formatVersion: 1,
			exportedAt: '2026-11-20T10:00:00.000Z',
			routineCount: 2,
			runCount: 1,
			workPeriodCount: 1,
			firstRunAt: '2026-11-19T09:00:00.000Z',
			lastRunAt: '2026-11-19T09:00:00.000Z'
		});
	});

	it('gives the start of the earliest and latest runs whatever order they are in', () => {
		const backup = createBackup(
			{
				routines: [oneRoundRoutine],
				runs: [
					runWith({ id: 'b', startedAt: '2026-11-19T12:00:00.000Z' }),
					runWith({ id: 'c', startedAt: '2026-11-21T08:00:00.000Z' }),
					runWith({ id: 'a', startedAt: '2026-11-10T08:00:00.000Z' })
				],
				workPeriods: [],
				settings: DEFAULT_SETTINGS
			},
			now
		);

		const summary = summarizeBackup(backup);

		expect(summary.firstRunAt).toBe('2026-11-10T08:00:00.000Z');
		expect(summary.lastRunAt).toBe('2026-11-21T08:00:00.000Z');
	});

	it('has no date range when the backup holds no runs', () => {
		const backup = createBackup(
			{ routines: [oneRoundRoutine], runs: [], workPeriods: [], settings: DEFAULT_SETTINGS },
			now
		);

		const summary = summarizeBackup(backup);

		expect(summary.runCount).toBe(0);
		expect(summary.firstRunAt).toBeNull();
		expect(summary.lastRunAt).toBeNull();
	});
});

describe('describeBackupSummary', () => {
	/** A summary of a backup with runs, which tests change where it matters. */
	const summary: BackupSummary = {
		formatVersion: 1,
		exportedAt: '2026-11-20T10:00:00.000Z',
		routineCount: 3,
		runCount: 5,
		workPeriodCount: 12,
		firstRunAt: '2026-11-10T08:00:00.000Z',
		lastRunAt: '2026-11-19T09:00:00.000Z'
	};

	it('gives the counts, the days of the first and last runs and the day it was made', () => {
		expect(describeBackupSummary(summary)).toBe(
			'The backup holds 3 routines, 5 runs, 12 work periods, with runs from 2026-11-10 to 2026-11-19, and was made on 2026-11-20.'
		);
	});

	it("gives each day in the user's time zone, not in UTC", () => {
		const lateEvening = {
			...summary,
			exportedAt: '2026-11-20T02:00:00.000Z',
			firstRunAt: '2026-11-10T03:00:00.000Z',
			lastRunAt: '2026-11-20T01:30:00.000Z'
		};

		expect(describeBackupSummary(lateEvening)).toContain(
			'with runs from 2026-11-09 to 2026-11-19, and was made on 2026-11-19.'
		);
	});

	it('uses the singular for a count of one', () => {
		const one = { ...summary, routineCount: 1, runCount: 1, workPeriodCount: 1 };

		expect(describeBackupSummary(one)).toContain('1 routine, 1 run, 1 work period,');
	});

	it('says no days of runs when the backup holds none', () => {
		const none = { ...summary, runCount: 0, workPeriodCount: 0, firstRunAt: null, lastRunAt: null };

		expect(describeBackupSummary(none)).toBe(
			'The backup holds 3 routines, 0 runs, 0 work periods, and was made on 2026-11-20.'
		);
	});
});
