// The activity log's entry for an import, which both storage backends write the same way.

import type { BackupSummary } from './backup-summary';
import { changeEntry, type NewLogEntry } from './log';

/**
 * Makes the log entry for an import that has replaced all the data.
 *
 * @param summary - What the imported backup held.
 * @param now - The moment of the import.
 * @returns A change entry whose details hold the backup's format version, when it was made, and
 * how many routines, runs and work periods it held.
 */
export function importLogEntry(summary: BackupSummary, now: Date): NewLogEntry {
	return changeEntry(now, 'Imported a backup', {
		action: 'import',
		formatVersion: summary.formatVersion,
		exportedAt: summary.exportedAt,
		routines: summary.routineCount,
		runs: summary.runCount,
		workPeriods: summary.workPeriodCount
	});
}
