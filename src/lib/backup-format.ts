// The JSON backup's shape, and making one from the app's data.

import type { Routine } from './routine';
import type { Run, WorkPeriod } from './run-records';
import type { Settings } from './settings';

/**
 * The version of the backup's format. A change to the shape of a backup raises it, so an older app
 * rejects a file it can't read rather than misreading it.
 */
export const BACKUP_FORMAT_VERSION = 1;

/** The value of a backup's `app` field, which tells a Cadoro backup from any other JSON file. */
export const BACKUP_APP_NAME = 'cadoro';

/**
 * Everything the JSON backup holds.
 *
 * @remarks
 * The run in progress isn't part of it, since the spec lists only routines, runs, work periods and
 * settings. The activity log isn't either, since log entries never leave the device except
 * through their own export.
 */
export type Backup = {
	/** Always `'cadoro'`. */
	app: typeof BACKUP_APP_NAME;
	/** The format version of the file. */
	formatVersion: number;
	/** When the backup was made, as a UTC timestamp. */
	exportedAt: string;
	/** Every routine, deleted ones included. */
	routines: Routine[];
	/** Every run, including one still in progress. */
	runs: Run[];
	/** Every work period. */
	workPeriods: WorkPeriod[];
	/** All the settings. */
	settings: Settings;
};

/** The data a backup is made from. */
export type BackupData = Pick<Backup, 'routines' | 'runs' | 'workPeriods' | 'settings'>;

/**
 * Makes a backup of the app's data.
 *
 * @param data - What to back up.
 * @param now - The moment the backup is made.
 * @returns The backup, in the current format version.
 */
export function createBackup(data: BackupData, now: Date): Backup {
	return {
		app: BACKUP_APP_NAME,
		formatVersion: BACKUP_FORMAT_VERSION,
		exportedAt: now.toISOString(),
		routines: data.routines,
		runs: data.runs,
		workPeriods: data.workPeriods,
		settings: data.settings
	};
}

/**
 * Writes a backup as the text of the file to download.
 *
 * @param backup - The backup.
 * @returns JSON indented with two spaces, so the file is readable.
 */
export function serializeBackup(backup: Backup): string {
	return JSON.stringify(backup, null, 2);
}
