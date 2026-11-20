// The files the app offers to download: what each is called, and how the activity log is written.

import { localDayText } from './day-slices';
import type { LogEntry } from './log';

/** The kinds of file the app exports, each with the start of its file name. */
const FILE_NAME_STARTS = {
	csv: 'cadoro-work-periods',
	backup: 'cadoro-backup',
	log: 'cadoro-activity-log'
} as const;

/** The file extension of each kind of export. */
const FILE_EXTENSIONS = { csv: 'csv', backup: 'json', log: 'json' } as const;

/** A kind of file the app exports. */
export type ExportKind = keyof typeof FILE_NAME_STARTS;

/**
 * Names a downloaded file after what it holds and the day it was made.
 *
 * @param kind - What the file holds.
 * @param now - The moment of the export. The day is the user's own, in their time zone, since it's
 * for them to tell files apart.
 * @returns The file name, such as `cadoro-backup-2026-11-19.json`.
 */
export function exportFileName(kind: ExportKind, now: Date): string {
	return `${FILE_NAME_STARTS[kind]}-${localDayText(now.getTime())}.${FILE_EXTENSIONS[kind]}`;
}

/**
 * Writes the activity log as the text of the file to download.
 *
 * @param entries - The entries, in the order to write them.
 * @returns A JSON array of the entries, indented with two spaces, each with its id, timestamp,
 * type, message and details.
 */
export function serializeLog(entries: LogEntry[]): string {
	return JSON.stringify(entries, null, 2);
}
