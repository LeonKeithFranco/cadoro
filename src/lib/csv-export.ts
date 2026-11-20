// The CSV export of work periods: one row per work period, for spreadsheets.

import type { Routine } from './routine';
import { workPeriodsOldestFirst, type WorkPeriod } from './run-records';
import { MS_PER_SECOND } from './time';

/** The CSV's header row, naming each column in the order the rows give them. */
export const CSV_COLUMNS: readonly string[] = [
	'routine',
	'block',
	'started_at',
	'ended_at',
	'worked_seconds',
	'target_minutes'
];

/** The line break RFC 4180 puts after every record. */
const CSV_LINE_BREAK = '\r\n';

/**
 * Quotes a CSV field when it needs it, as RFC 4180 says.
 *
 * @param field - The field's text.
 * @returns The text as it is, or in double quotes, with any double quote inside doubled, when it
 * holds a comma, a double quote or a line break.
 */
function csvField(field: string): string {
	const needsQuotes = /[",\r\n]/.test(field);
	if (!needsQuotes) {
		return field;
	}
	return `"${field.replaceAll('"', '""')}"`;
}

/** What starts a cell that a spreadsheet may read as a formula: `=`, `+`, `-`, `@`, tab or CR. */
const FORMULA_START = /^[=+\-@\t\r]/;

/**
 * Makes a title safe to open in a spreadsheet, which reads a cell that starts like a formula as
 * one, so a title could run code or leak data (CSV injection).
 *
 * @remarks
 * Follows OWASP's guidance: a single quote in front makes the spreadsheet show the cell as text.
 * Only titles go through it, since the numbers and timestamps are the app's own.
 *
 * @param title - A routine or block title.
 * @returns The title, with a single quote in front when it starts with `=`, `+`, `-`, `@`, a tab
 * or a carriage return.
 */
function spreadsheetSafe(title: string): string {
	return FORMULA_START.test(title) ? `'${title}` : title;
}

/**
 * Finds the title of the block a work period was a cycle of, as the routine has it now.
 *
 * @param routine - The routine the period belongs to, or `undefined` when it isn't known.
 * @param blockId - The block's id.
 * @returns The block's title, or an empty string when the routine or the block no longer exists.
 */
function blockTitle(routine: Routine | undefined, blockId: string): string {
	const block = routine?.blocks.find((candidate) => candidate.id === blockId);
	return block?.title ?? '';
}

/**
 * Makes one CSV row from a work period.
 *
 * @param period - The work period.
 * @param routinesById - Every routine, deleted ones included, by id.
 * @returns The row's fields, in the order of {@link CSV_COLUMNS}. The start is the first
 * segment's start and the end is the last segment's end, so pauses sit between them.
 */
function csvRow(period: WorkPeriod, routinesById: Map<string, Routine>): string[] {
	const routine = routinesById.get(period.routineId);
	const firstSegment = period.segments.at(0);
	const lastSegment = period.segments.at(-1);

	return [
		spreadsheetSafe(routine?.title ?? ''),
		spreadsheetSafe(blockTitle(routine, period.blockId)),
		firstSegment?.start ?? '',
		lastSegment?.end ?? '',
		String(period.workedMs / MS_PER_SECOND),
		String(period.targetMinutes)
	];
}

/**
 * Makes the CSV export of every work period.
 *
 * @remarks
 * The columns are in {@link CSV_COLUMNS}. Times are UTC timestamps such as
 * `2026-11-19T09:30:00.000Z`, `worked_seconds` is the time worked in seconds at full precision,
 * such as `1500.123`, and `target_minutes` is the block's target when the period ran. Routine and
 * block titles are those the routine has now, or empty when it or the block no longer exists, and
 * start with a single quote when they begin like a spreadsheet formula.
 * Records end with CRLF, as RFC 4180 says, and the rows are oldest first.
 *
 * @param routines - Every routine, deleted ones included, so each period finds its routine's title.
 * @param workPeriods - The work periods to export, in any order.
 * @returns The CSV text: the header row, then a row for each work period, so an empty dataset gives
 * the header alone.
 */
export function workPeriodsToCsv(routines: Routine[], workPeriods: WorkPeriod[]): string {
	const routinesById = new Map(routines.map((routine) => [routine.id, routine]));
	const rows = workPeriodsOldestFirst(workPeriods).map((period) => csvRow(period, routinesById));

	return [CSV_COLUMNS, ...rows].map((row) => row.map(csvField).join(',') + CSV_LINE_BREAK).join('');
}
