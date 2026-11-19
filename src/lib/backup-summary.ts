// What a valid backup holds, for the import's confirmation.

import type { Backup } from './backup-format';
import { fromUtcTimestamp } from './time';

/** What a backup holds, counted for the user to check before an import replaces their data. */
export type BackupSummary = {
	/** The backup's format version. */
	formatVersion: number;
	/** When the backup was made, as a UTC timestamp. */
	exportedAt: string;
	/** How many routines it holds, deleted ones included. */
	routineCount: number;
	/** How many runs it holds. */
	runCount: number;
	/** How many work periods it holds. */
	workPeriodCount: number;
	/** When its earliest run started, as a UTC timestamp, or `null` when it holds no runs. */
	firstRunAt: string | null;
	/** When its latest run started, as a UTC timestamp, or `null` when it holds no runs. */
	lastRunAt: string | null;
};

/**
 * Counts what a backup holds.
 *
 * @param backup - A valid backup.
 * @returns Its counts and the start of its first and last runs.
 */
export function summarizeBackup(backup: Backup): BackupSummary {
	const startTimes = backup.runs.map((run) => run.startedAt);
	const byMoment = startTimes.toSorted((a, b) => fromUtcTimestamp(a) - fromUtcTimestamp(b));

	return {
		formatVersion: backup.formatVersion,
		exportedAt: backup.exportedAt,
		routineCount: backup.routines.length,
		runCount: backup.runs.length,
		workPeriodCount: backup.workPeriods.length,
		firstRunAt: byMoment.at(0) ?? null,
		lastRunAt: byMoment.at(-1) ?? null
	};
}
