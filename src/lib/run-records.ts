// The records storage keeps of each run: the run itself and every work period it ended, shaped as
// in the data model in `docs/SPEC.md`. The run engine knows nothing of ids or storage, so these
// pure functions compare a run before and after each button press to work out what to save.

import { requireDefined } from './defined';
import {
	blockAt,
	summarizeRun,
	type EndedWorkPeriod,
	type RoutinePlan,
	type RunState,
	type Segment
} from './run';
import { fromUtcTimestamp, toUtcTimestamp } from './time';

/** One use of a routine, from pressing Play to the end of its last work period or Finish. */
export type Run = {
	/** A UUID. */
	id: string;
	/** The routine that was run. */
	routineId: string;
	/** When Play started the run, as a UTC timestamp. */
	startedAt: string;
	/** When the run ended, as a UTC timestamp, or `null` while it's in progress. */
	endedAt: string | null;
	/**
	 * `completed` when its last work period ended, `finished` when Finish was pressed, or `null`
	 * while it's in progress.
	 */
	outcome: 'completed' | 'finished' | null;
	/** The rounds the run reached, counting the round it ended in, or 0 while it's in progress. */
	roundsReached: number;
};

/** One unpaused stretch of a work period, as storage keeps it. */
export type StoredSegment = {
	/** When the stretch started, by Play or by the work period starting, as a UTC timestamp. */
	start: string;
	/** When the stretch ended, by Pause, Next or Finish, as a UTC timestamp. */
	end: string;
};

/** One stretch of counting-up work, from its start until Next or Finish. */
export type WorkPeriod = {
	/** A UUID. */
	id: string;
	/** The run it was part of. */
	runId: string;
	/** The routine that was run. */
	routineId: string;
	/** The block it was a cycle of. */
	blockId: string;
	/** The block's target when the period ran, in whole minutes, so later edits don't change history. */
	targetMinutes: number;
	/** Its unpaused stretches, in order, so paused time never counts as work. */
	segments: StoredSegment[];
	/** The time worked, the sum of the segments, in milliseconds at full precision. */
	workedMs: number;
};

/** What one button press leaves to save. */
export type RunRecords = {
	/** The run's record when the press started or ended the run, or `null` when it's unchanged. */
	run: Run | null;
	/** The work periods the press ended, in order: none, or one for Next or Finish mid-work. */
	workPeriods: WorkPeriod[];
};

/**
 * Makes the records of a change that keeps nothing new, such as a pause or a heartbeat.
 *
 * @returns No run and no work periods, in a new object each time, so no caller can change
 * another's.
 */
export function noRecords(): RunRecords {
	return { run: null, workPeriods: [] };
}

/** A button press: the run before and after it, and what's known about the run so far. */
export type ButtonPress = {
	/** The run before the press. */
	before: RunState;
	/** The run the press gave, from the run engine. */
	after: RunState;
	/** When the button was pressed, in milliseconds since 1970 (UTC). */
	now: number;
	/** The routine being run. */
	routineId: string;
	/** The run's record so far, or `null` before Play has started the run. */
	record: Run | null;
};

/**
 * Works out what a button press leaves to save: the run, when it starts or ends, and each work
 * period it ends.
 *
 * @remarks
 * Play on a ready run starts a new run record. Next and Finish end the current work period, if
 * there is one, and the run's end, by Finish or a finite routine's last work period, fills in
 * when and how it ended. Pause, resuming and moving on from a break change nothing that's kept,
 * since breaks aren't recorded.
 *
 * @param press - The run before and after the press, the moment and the run's record so far.
 * @param newId - Returns a new unique id each time it's called, such as `crypto.randomUUID`. It's
 * called for the new run first, then for each work period in order.
 * @returns The records to save, which are empty when the press changed nothing that's kept.
 * @throws {@link Error} If the press ends work or the run when `record` is `null`, which means the
 * caller lost the record Play started.
 */
export function recordPress(press: ButtonPress, newId: () => string): RunRecords {
	const { before, after, now } = press;
	const isStart = before.status === 'ready' && after.status !== 'ready';
	const isEnd = before.status !== 'ended' && after.status === 'ended';
	const endedPeriods = newlyEndedPeriods(before, after);

	const record = isStart ? startedRun(newId(), press.routineId, now) : press.record;
	if (record === null) {
		const hasWorkToSave = endedPeriods.length > 0 || isEnd;
		if (hasWorkToSave) {
			throw new Error('A run must have a record before its work can be saved.');
		}
		return noRecords();
	}

	const workPeriods = endedPeriods.map((period) =>
		workPeriodRecord(period, after.plan, record, newId())
	);

	if (isEnd) {
		const roundsReached = summarizeRun(after).roundsReached;
		// The device's clock can move back, as the engine's segments allow for, and a run can't end
		// before it started.
		const endedAtMs = Math.max(now, fromUtcTimestamp(record.startedAt));
		const endedRecord: Run = {
			...record,
			endedAt: toUtcTimestamp(endedAtMs),
			outcome: after.outcome,
			roundsReached
		};
		return { run: endedRecord, workPeriods };
	}
	return { run: isStart ? record : null, workPeriods };
}

/**
 * Puts runs in the order they started.
 *
 * @param runs - Runs in any order.
 * @returns A new list of the runs, earliest `startedAt` first.
 */
export function runsOldestFirst(runs: Run[]): Run[] {
	return runs.toSorted((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));
}

/**
 * Puts work periods in the order they started.
 *
 * @param periods - Work periods in any order.
 * @returns A new list of the work periods, earliest first segment first.
 */
export function workPeriodsOldestFirst(periods: WorkPeriod[]): WorkPeriod[] {
	return periods.toSorted((a, b) => startOf(a) - startOf(b));
}

/**
 * Finds when a work period started.
 *
 * @param period - The work period. It always has a segment, since a work period starts running.
 * @returns When its first segment started, in milliseconds since 1970 (UTC).
 */
function startOf(period: WorkPeriod): number {
	const firstSegment = requireDefined(period.segments[0], "the work period's first segment");
	return Date.parse(firstSegment.start);
}

/**
 * Makes the record of a run that Play has just started.
 *
 * @param id - The new run's id.
 * @param routineId - The routine being run.
 * @param now - When Play was pressed, in milliseconds since 1970 (UTC).
 * @returns The run, in progress.
 */
function startedRun(id: string, routineId: string, now: number): Run {
	return {
		id,
		routineId,
		startedAt: toUtcTimestamp(now),
		endedAt: null,
		outcome: null,
		roundsReached: 0
	};
}

/**
 * Finds the work periods a press ended, by comparing the run's ended periods before and after.
 *
 * @remarks
 * The engine only ever adds to the end of a run's ended periods, so those past the old count are
 * the new ones.
 *
 * @param before - The run before the press.
 * @param after - The run after the press.
 * @returns The work periods that are new after the press, in order.
 */
function newlyEndedPeriods(before: RunState, after: RunState): readonly EndedWorkPeriod[] {
	const endedBefore = endedPeriodsOf(before);
	return endedPeriodsOf(after).slice(endedBefore.length);
}

/**
 * Lists the work periods a run has ended.
 *
 * @param run - The run.
 * @returns Its ended work periods in order, or none for a run that hasn't started.
 */
function endedPeriodsOf(run: RunState): readonly EndedWorkPeriod[] {
	return run.status === 'ready' ? [] : run.endedPeriods;
}

/**
 * Makes the record of an ended work period.
 *
 * @param period - The work period, as the engine ended it.
 * @param plan - The routine being run, whose blocks give the period's block.
 * @param run - The record of the run it was part of.
 * @param id - The work period's id.
 * @returns The work period, with its moments as UTC timestamps.
 */
function workPeriodRecord(
	period: EndedWorkPeriod,
	plan: RoutinePlan,
	run: Run,
	id: string
): WorkPeriod {
	return {
		id,
		runId: run.id,
		routineId: run.routineId,
		blockId: blockAt(plan, period.position).id,
		targetMinutes: period.targetMinutes,
		segments: period.segments.map(storedSegment),
		workedMs: period.workedMs
	};
}

/**
 * Converts a stretch of work from the engine's milliseconds to UTC timestamps.
 *
 * @param segment - The stretch, in milliseconds since 1970 (UTC).
 * @returns The same stretch, as UTC timestamps.
 */
export function storedSegment(segment: Segment): StoredSegment {
	return { start: toUtcTimestamp(segment.start), end: toUtcTimestamp(segment.end) };
}

/**
 * Converts a stretch of work from storage's UTC timestamps back to the engine's milliseconds,
 * undoing {@link storedSegment}.
 *
 * @param segment - The stretch, as UTC timestamps.
 * @returns The same stretch, in milliseconds since 1970 (UTC).
 */
export function segmentFromStored(segment: StoredSegment): Segment {
	return { start: fromUtcTimestamp(segment.start), end: fromUtcTimestamp(segment.end) };
}
