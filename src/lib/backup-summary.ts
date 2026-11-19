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
 * Words a count with its unit, in the singular for 1.
 *
 * @param count - How many.
 * @param unit - The unit in the singular, such as `run`.
 * @returns For example `1 run` or `3 runs`.
 */
export function counted(count: number, unit: string): string {
	return `${count} ${unit}${count === 1 ? '' : 's'}`;
}

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
	// The `en-CA` locale writes a date as year, month and day, joined with dashes.
	return new Date(fromUtcTimestamp(timestamp)).toLocaleDateString('en-CA');
}

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
