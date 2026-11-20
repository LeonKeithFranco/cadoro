// What a valid backup holds, for the import's confirmation.

import type { Backup } from './backup-format';
import { localDayText } from './day-slices';
import { counted } from './plural';
import { runsOldestFirst } from './run-records';
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
 * Words what a backup holds for the import's confirmation.
 *
 * @param summary - What the backup holds.
 * @returns A sentence with the counts, the days of the first and last runs when it has runs, and
 * the day the backup was made, each in the user's time zone.
 */
export function describeBackupSummary(summary: BackupSummary): string {
	const counts = [
		counted(summary.routineCount, 'routine'),
		counted(summary.runCount, 'run'),
		counted(summary.workPeriodCount, 'work period')
	].join(', ');
	const exportedDay = localDay(summary.exportedAt);
	if (summary.firstRunAt === null || summary.lastRunAt === null) {
		return `The backup holds ${counts}, and was made on ${exportedDay}.`;
	}
	const firstDay = localDay(summary.firstRunAt);
	const lastDay = localDay(summary.lastRunAt);
	return `The backup holds ${counts}, with runs from ${firstDay} to ${lastDay}, and was made on ${exportedDay}.`;
}

/**
 * Works out the user's own day of a moment, since days are worked out locally only when shown.
 *
 * @param timestamp - A UTC timestamp.
 * @returns The day in the user's time zone, such as `2026-11-19`.
 */
function localDay(timestamp: string): string {
	return localDayText(fromUtcTimestamp(timestamp));
}

/**
 * Counts what a backup holds.
 *
 * @param backup - A valid backup.
 * @returns Its counts and the start of its first and last runs.
 */
export function summarizeBackup(backup: Backup): BackupSummary {
	const byMoment = runsOldestFirst(backup.runs);

	return {
		formatVersion: backup.formatVersion,
		exportedAt: backup.exportedAt,
		routineCount: backup.routines.length,
		runCount: backup.runs.length,
		workPeriodCount: backup.workPeriods.length,
		firstRunAt: byMoment.at(0)?.startedAt ?? null,
		lastRunAt: byMoment.at(-1)?.startedAt ?? null
	};
}
