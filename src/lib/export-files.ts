// The files the app offers to download: what each is called, and how the activity log is written.

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
 * Pads a number to two digits, such as `7` to `07`.
 *
 * @param value - A whole number from 0 to 99.
 * @returns The number as two digits.
 */
function twoDigits(value: number): string {
	return String(value).padStart(2, '0');
}

/**
 * Names a downloaded file after what it holds and the day it was made.
 *
 * @param kind - What the file holds.
 * @param now - The moment of the export. The day is the user's own, in their time zone, since it's
 * for them to tell files apart.
 * @returns The file name, such as `cadoro-backup-2026-11-19.json`.
 */
export function exportFileName(kind: ExportKind, now: Date): string {
	const month = twoDigits(now.getMonth() + 1);
	const day = twoDigits(now.getDate());
	return `${FILE_NAME_STARTS[kind]}-${now.getFullYear()}-${month}-${day}.${FILE_EXTENSIONS[kind]}`;
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
