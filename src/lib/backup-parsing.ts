// Reading a backup file and checking every part of it, so an invalid file is rejected whole.

import {
	asArray,
	asObject,
	booleanField,
	choiceField,
	fieldPath,
	integerField,
	InvalidBackupError,
	nonNegativeNumberField,
	nullableStringField,
	nullableTimestampField,
	stringField,
	timestampField,
	type JsonObject
} from './backup-fields';
import { BACKUP_APP_NAME, BACKUP_FORMAT_VERSION, type Backup } from './backup-format';
import type { Block, Routine } from './routine';
import { TARGET_MINUTES_MAX, TARGET_MINUTES_MIN } from './routine-limits';
import { validateRoutine, type RoutineProblems } from './routine-validation';
import type { Run, StoredSegment, WorkPeriod } from './run-records';
import { ROUTINE_SORTS } from './routine-sort';
import { THEMES, VOLUME_MAX, VOLUME_MIN, type Settings } from './settings';
import { fromUtcTimestamp } from './time';

/** The result of reading a backup file: the backup, or the reason it was rejected. */
export type BackupParseResult = { ok: true; backup: Backup } | { ok: false; message: string };

/** The run outcomes a backup may hold. */
const OUTCOMES: readonly NonNullable<Run['outcome']>[] = ['completed', 'finished'];

/**
 * The bound for whole numbers whose real limits are checked afterwards, by `validateRoutine`,
 * which says what's wrong in its own words. The reader then checks only that it's a whole number.
 */
const LARGEST_COUNT = Number.MAX_SAFE_INTEGER;

/**
 * Describes the first thing {@link validateRoutine} found wrong.
 *
 * @param problems - What validation found.
 * @returns A phrase saying which field is wrong and how, or `undefined` when nothing is.
 */
function firstRoutineProblem(problems: RoutineProblems): string | undefined {
	if (problems.title !== undefined) return `title: ${problems.title}`;
	if (problems.rounds !== undefined) return `rounds: ${problems.rounds}`;
	if (problems.blocks !== undefined) return `blocks: ${problems.blocks}`;

	const [blockId, blockFields] = Object.entries(problems.blockProblems)[0] ?? [];
	if (blockId === undefined || blockFields === undefined) return undefined;
	const [field, message] = Object.entries(blockFields)[0] ?? [];
	return `block ${blockId} ${field}: ${message}`;
}

/**
 * Reads one block, checking its fields' types.
 *
 * @param value - The unchecked block.
 * @param path - Where the block is, for messages.
 * @returns The block. Its limits are checked later, with its routine's.
 * @throws {@link InvalidBackupError} If a field is missing or has the wrong type.
 */
function parseBlock(value: unknown, path: string): Block {
	const object = asObject(value, path);
	return {
		id: stringField(object, 'id', path),
		title: stringField(object, 'title', path),
		targetMinutes: integerField(object, 'targetMinutes', path, -LARGEST_COUNT, LARGEST_COUNT),
		breakPercent: integerField(object, 'breakPercent', path, -LARGEST_COUNT, LARGEST_COUNT),
		cycles: integerField(object, 'cycles', path, -LARGEST_COUNT, LARGEST_COUNT)
	};
}

/**
 * Reads a routine's rounds, which are a whole number or `'infinite'`.
 *
 * @param object - The routine.
 * @param path - Where the routine is, for messages.
 * @returns The rounds. Their limits are checked later, with the routine's.
 * @throws {@link InvalidBackupError} If the field is missing or is neither.
 */
function parseRounds(object: JsonObject, path: string): Routine['rounds'] {
	if (object['rounds'] === 'infinite') {
		return 'infinite';
	}
	return integerField(object, 'rounds', path, -LARGEST_COUNT, LARGEST_COUNT);
}

/**
 * Reads one routine and checks it against the data model's limits.
 *
 * @param value - The unchecked routine.
 * @param path - Where the routine is, for messages.
 * @returns The routine.
 * @throws {@link InvalidBackupError} If a field is missing, has the wrong type or breaks a limit.
 */
function parseRoutine(value: unknown, path: string): Routine {
	const object = asObject(value, path);
	const routine: Routine = {
		id: stringField(object, 'id', path),
		title: stringField(object, 'title', path),
		rounds: parseRounds(object, path),
		blocks: asArray(object['blocks'], fieldPath(path, 'blocks')).map((block, index) =>
			parseBlock(block, `${fieldPath(path, 'blocks')}[${index}]`)
		),
		customPosition: integerField(object, 'customPosition', path, 0, LARGEST_COUNT),
		createdAt: timestampField(object, 'createdAt', path),
		deletedAt: nullableTimestampField(object, 'deletedAt', path)
	};

	const problem = firstRoutineProblem(validateRoutine(routine));
	if (problem !== undefined) {
		throw new InvalidBackupError(`${path} has a ${problem}`);
	}
	return routine;
}

/**
 * Reads one run, checking its fields' types and that its end and outcome agree.
 *
 * @param value - The unchecked run.
 * @param path - Where the run is, for messages.
 * @returns The run. Its routine is checked later, against the file's routines.
 * @throws {@link InvalidBackupError} If a field is missing, has the wrong type, or the run has an
 * end without an outcome, an outcome without an end, or ends before it starts.
 */
function parseRun(value: unknown, path: string): Run {
	const object = asObject(value, path);
	const startedAt = timestampField(object, 'startedAt', path);
	const endedAt = nullableTimestampField(object, 'endedAt', path);
	const outcome =
		object['outcome'] === null ? null : choiceField(object, 'outcome', path, OUTCOMES);

	if ((endedAt === null) !== (outcome === null)) {
		throw new InvalidBackupError(`${path} must have both endedAt and outcome, or neither.`);
	}
	if (endedAt !== null && fromUtcTimestamp(endedAt) < fromUtcTimestamp(startedAt)) {
		throw new InvalidBackupError(`${path} ends before it starts.`);
	}

	return {
		id: stringField(object, 'id', path),
		routineId: stringField(object, 'routineId', path),
		startedAt,
		endedAt,
		outcome,
		roundsReached: integerField(object, 'roundsReached', path, 0, LARGEST_COUNT)
	};
}

/**
 * Reads one unpaused stretch of a work period.
 *
 * @param value - The unchecked segment.
 * @param path - Where the segment is, for messages.
 * @returns The segment.
 * @throws {@link InvalidBackupError} If a field is missing or isn't a UTC timestamp, or the
 * segment ends before it starts.
 */
function parseSegment(value: unknown, path: string): StoredSegment {
	const object = asObject(value, path);
	const segment = {
		start: timestampField(object, 'start', path),
		end: timestampField(object, 'end', path)
	};
	if (fromUtcTimestamp(segment.end) < fromUtcTimestamp(segment.start)) {
		throw new InvalidBackupError(`${path} ends before it starts.`);
	}
	return segment;
}

/**
 * Adds up the length of work period segments.
 *
 * @param segments - The segments.
 * @returns Their total length, in milliseconds.
 */
function totalMs(segments: StoredSegment[]): number {
	return segments.reduce(
		(total, segment) => total + fromUtcTimestamp(segment.end) - fromUtcTimestamp(segment.start),
		0
	);
}

/**
 * Reads one work period, checking its fields' types and that its time worked is the sum of its
 * segments.
 *
 * @param value - The unchecked work period.
 * @param path - Where the work period is, for messages.
 * @returns The work period. Its run and routine are checked later, against the file's.
 * @throws {@link InvalidBackupError} If a field is missing, has the wrong type, the period has no
 * segments, its target is outside the limits for a block's target, or its time worked isn't the
 * sum of its segments.
 */
function parseWorkPeriod(value: unknown, path: string): WorkPeriod {
	const object = asObject(value, path);
	const segmentsPath = fieldPath(path, 'segments');
	const segments = asArray(object['segments'], segmentsPath).map((segment, index) =>
		parseSegment(segment, `${segmentsPath}[${index}]`)
	);
	if (segments.length === 0) {
		throw new InvalidBackupError(`${segmentsPath} must have at least one segment.`);
	}

	const workedMs = nonNegativeNumberField(object, 'workedMs', path);
	if (workedMs !== totalMs(segments)) {
		throw new InvalidBackupError(
			`${fieldPath(path, 'workedMs')} must be the sum of the segments, ${totalMs(segments)}.`
		);
	}

	return {
		id: stringField(object, 'id', path),
		runId: stringField(object, 'runId', path),
		routineId: stringField(object, 'routineId', path),
		blockId: stringField(object, 'blockId', path),
		targetMinutes: integerField(
			object,
			'targetMinutes',
			path,
			TARGET_MINUTES_MIN,
			TARGET_MINUTES_MAX
		),
		segments,
		workedMs
	};
}

/**
 * Reads the settings, checking each one's type and limits.
 *
 * @param value - The unchecked settings.
 * @returns The settings. The last routine is checked later, against the file's routines.
 * @throws {@link InvalidBackupError} If a setting is missing, has the wrong type or breaks a limit.
 */
function parseSettings(value: unknown): Settings {
	const path = 'settings';
	const object = asObject(value, path);
	return {
		theme: choiceField(object, 'theme', path, THEMES),
		volume: integerField(object, 'volume', path, VOLUME_MIN, VOLUME_MAX),
		targetChime: stringField(object, 'targetChime', path),
		breakChime: stringField(object, 'breakChime', path),
		keepScreenAwake: booleanField(object, 'keepScreenAwake', path),
		routineSort: choiceField(object, 'routineSort', path, ROUTINE_SORTS),
		lastRoutineId: nullableStringField(object, 'lastRoutineId', path)
	};
}

/**
 * Reads a list of records, each checked by a reader.
 *
 * @typeParam Item - The kind of record.
 * @param object - The object holding the list.
 * @param key - The list's name.
 * @param parseItem - Reads one record from its unchecked value and its path.
 * @returns The records.
 * @throws {@link InvalidBackupError} If the list is missing, isn't a list, or a record is invalid.
 */
function parseList<Item>(
	object: JsonObject,
	key: string,
	parseItem: (value: unknown, path: string) => Item
): Item[] {
	return asArray(object[key], key).map((item, index) => parseItem(item, `${key}[${index}]`));
}

/**
 * Checks that no two records share an id.
 *
 * @param items - The records.
 * @param key - The list's name, for the message.
 * @throws {@link InvalidBackupError} If two records have the same id.
 */
function requireUniqueIds(items: { id: string }[], key: string): void {
	const seen = new Set<string>();
	for (const [index, item] of items.entries()) {
		if (seen.has(item.id)) {
			throw new InvalidBackupError(`${key}[${index}] repeats the id "${item.id}".`);
		}
		seen.add(item.id);
	}
}

/**
 * Checks that the file's records refer only to records the file holds.
 *
 * @param backup - The backup, every part of which is already checked on its own.
 * @throws {@link InvalidBackupError} If a run or work period names a routine that is missing, a
 * work period names a missing run or the routine of another run, or the last routine used is
 * missing.
 */
function requireKnownReferences(backup: Backup): void {
	const routineIds = new Set(backup.routines.map((routine) => routine.id));
	const runsById = new Map(backup.runs.map((run) => [run.id, run]));

	for (const [index, run] of backup.runs.entries()) {
		if (!routineIds.has(run.routineId)) {
			throw new InvalidBackupError(
				`runs[${index}] (the run "${run.id}", started ${run.startedAt}) refers to the routine "${run.routineId}", which the file doesn't hold.`
			);
		}
	}

	for (const [index, period] of backup.workPeriods.entries()) {
		const run = runsById.get(period.runId);
		if (run === undefined) {
			throw new InvalidBackupError(
				`workPeriods[${index}] refers to the run "${period.runId}", which the file doesn't hold.`
			);
		}
		if (period.routineId !== run.routineId) {
			throw new InvalidBackupError(
				`workPeriods[${index}] has a routine that isn't the routine of its run.`
			);
		}
	}

	const { lastRoutineId } = backup.settings;
	if (lastRoutineId !== null && !routineIds.has(lastRoutineId)) {
		throw new InvalidBackupError(
			`settings.lastRoutineId refers to the routine "${lastRoutineId}", which the file doesn't hold.`
		);
	}
}

/**
 * Checks the file's format version.
 *
 * @param object - The file's top-level object.
 * @throws {@link InvalidBackupError} If the file isn't a Cadoro backup, or its format version is
 * missing, newer than this app reads, or older than 1.
 */
function requireReadableFormat(object: JsonObject): void {
	if (object['app'] !== BACKUP_APP_NAME) {
		throw new InvalidBackupError('This file is not a Cadoro backup.');
	}
	const version = integerField(object, 'formatVersion', '', -LARGEST_COUNT, LARGEST_COUNT);
	if (version > BACKUP_FORMAT_VERSION) {
		throw new InvalidBackupError(
			`This backup is in format ${version}, made by a newer version of Cadoro. This app reads format ${BACKUP_FORMAT_VERSION}. Update the app and try again.`
		);
	}
	if (version < BACKUP_FORMAT_VERSION) {
		throw new InvalidBackupError(`Backup format ${version} isn't supported.`);
	}
}

/**
 * Reads a backup file and checks all of it.
 *
 * @remarks
 * A file with anything wrong is rejected whole, and the message names the first problem found. It
 * checks that the text is JSON, that it's a Cadoro backup in a format version this app reads, that
 * every field is there with the right type and within the data model's limits, that no two
 * records share an id, and that every reference points at a record the file holds.
 *
 * @param text - The text of the file.
 * @returns The backup when the file is valid, or else a message saying what's wrong.
 * @throws {@link Error} If the code itself fails, which is a bug and never down to the file.
 */
export function parseBackup(text: string): BackupParseResult {
	try {
		return { ok: true, backup: readBackup(text) };
	} catch (error) {
		if (error instanceof InvalidBackupError) {
			return { ok: false, message: error.message };
		}
		throw error;
	}
}

/**
 * Reads and checks a backup, stopping at the first problem.
 *
 * @param text - The text of the file.
 * @returns The backup.
 * @throws {@link InvalidBackupError} If the file isn't valid.
 */
function readBackup(text: string): Backup {
	let json: unknown;
	try {
		json = JSON.parse(text);
	} catch {
		throw new InvalidBackupError('This file is not valid JSON.');
	}

	const object = asObject(json, 'The file');
	requireReadableFormat(object);

	const backup: Backup = {
		app: BACKUP_APP_NAME,
		formatVersion: BACKUP_FORMAT_VERSION,
		exportedAt: timestampField(object, 'exportedAt', ''),
		routines: parseList(object, 'routines', parseRoutine),
		runs: parseList(object, 'runs', parseRun),
		workPeriods: parseList(object, 'workPeriods', parseWorkPeriod),
		settings: parseSettings(object['settings'])
	};

	requireUniqueIds(backup.routines, 'routines');
	requireUniqueIds(backup.runs, 'runs');
	requireUniqueIds(backup.workPeriods, 'workPeriods');
	requireKnownReferences(backup);
	return backup;
}
