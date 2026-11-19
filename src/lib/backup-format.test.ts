import { describe, expect, it } from 'vitest';
import { createBackup, serializeBackup } from './backup-format';
import { DEFAULT_SETTINGS } from './settings';
import { oneRoundRoutine } from './testing/routines';
import { firstWorkPeriod, runInProgress } from './testing/run-records';

describe('createBackup', () => {
	it('holds the routines, runs, work periods and settings, in format version 1 from the given moment', () => {
		const backup = createBackup(
			{
				routines: [oneRoundRoutine],
				runs: [runInProgress],
				workPeriods: [firstWorkPeriod],
				settings: DEFAULT_SETTINGS
			},
			new Date('2026-11-20T10:00:00.000Z')
		);

		expect(backup).toEqual({
			app: 'cadoro',
			formatVersion: 1,
			exportedAt: '2026-11-20T10:00:00.000Z',
			routines: [oneRoundRoutine],
			runs: [runInProgress],
			workPeriods: [firstWorkPeriod],
			settings: DEFAULT_SETTINGS
		});
	});
});

describe('serializeBackup', () => {
	it('writes indented JSON that reads back as the same backup', () => {
		const backup = createBackup(
			{ routines: [oneRoundRoutine], runs: [], workPeriods: [], settings: DEFAULT_SETTINGS },
			new Date('2026-11-20T10:00:00.000Z')
		);

		const text = serializeBackup(backup);

		expect(text).toContain('\n  "formatVersion": 1');
		expect(JSON.parse(text)).toEqual(backup);
	});
});
