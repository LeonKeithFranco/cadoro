// The run in progress as storage keeps it, so a reload, or the phone stopping the app, can restore
// it. Storage keeps exact moments as UTC timestamps, while the engine works in milliseconds, so
// these pure functions convert the engine's run to its stored shape and back.

import { pause, type EndedWorkPeriod, type Position, type ReadyRun, type RunState } from './run';
import { segmentFromStored, storedSegment, type Run, type StoredSegment } from './run-records';
import type { Routine } from './routine';
import { fromUtcTimestamp, toUtcTimestamp } from './time';

/** A run that Play has started, in a work period, on a break or ended. A ready run isn't saved. */
export type StartedRun = Exclude<RunState, ReadyRun>;

/** A work period the run has ended, as storage keeps it. */
export type StoredEndedWorkPeriod = {
	/** Where it was in the routine. */
	position: Position;
	/** Its block's target when it ran, in whole minutes. */
	targetMinutes: number;
	/** Its unpaused stretches, in order. */
	segments: StoredSegment[];
	/** The time worked, the sum of the segments, in milliseconds. */
	workedMs: number;
};

/** A run during a work period, as storage keeps it. */
export type StoredWorkingRun = {
	/** Marks the run as in a work period. */
	status: 'working';
	/** The work periods this run has already ended, in order. */
	endedPeriods: StoredEndedWorkPeriod[];
	/** Where this work period is in the routine. */
	position: Position;
	/** This work period's stretches already ended by Pause. */
	segments: StoredSegment[];
	/** When the current stretch started, as a UTC timestamp, or `null` while paused. */
	runningSince: string | null;
};

/** A run during a break, as storage keeps it. */
export type StoredBreakRun = {
	/** Marks the run as on a break. */
	status: 'break';
	/** The work periods this run has ended, in order, ending with the one this break follows. */
	endedPeriods: StoredEndedWorkPeriod[];
	/** Where the work period this break follows is in the routine. */
	position: Position;
	/** Where the work period after this break is in the routine. */
	nextWorkPosition: Position;
	/** The whole break earned, in whole seconds, as milliseconds. */
	earnedMs: number;
	/** The break left when the current stretch started, or when it was paused, in milliseconds. */
	remainingMs: number;
	/** When the current stretch started, as a UTC timestamp, or `null` while paused. */
	runningSince: string | null;
};

/** A run that has ended, as storage keeps it until its summary is closed. */
export type StoredEndedRun = {
	/** Marks the run as over. */
	status: 'ended';
	/** Every work period the run ended, in order. */
	endedPeriods: StoredEndedWorkPeriod[];
	/** `completed` when its last work period ended, or `finished` when Finish was pressed. */
	outcome: 'completed' | 'finished';
};

/**
 * A started run as storage keeps it: the engine's run without its routine, with every moment as a
 * UTC timestamp.
 *
 * @remarks
 * The routine isn't kept, since the run's record names it and a routine can't be edited while it
 * runs. Restoring takes it from the saved routines.
 */
export type StoredRunState = StoredWorkingRun | StoredBreakRun | StoredEndedRun;

/** The one run in progress, as storage keeps it. */
export type StoredRunInProgress = {
	/** The run's record, so a restored run ends on the same record that Play started. */
	record: Run;
	/** Where the run had got to, as of its last save. */
	run: StoredRunState;
	/**
	 * When the app last saved the run, on a button press, on the screen's tick or as the page was
	 * hidden, as a UTC timestamp. Time after it doesn't count, as the app may have stopped then.
	 */
	heartbeatAt: string;
};

/** A run restored from storage, ready for the timer to show. */
export type RestoredRun = {
	/** The routine the run belongs to. */
	routine: Routine;
	/** The run's record, as Play started it. */
	record: Run;
	/** The run, paused at its last heartbeat if it was running then. */
	run: RunState;
};

/**
 * Converts the run in progress to the shape storage keeps.
 *
 * @param record - The run's record, as Play started it.
 * @param run - The run, from the engine.
 * @param heartbeatAt - The moment of this save, in milliseconds since 1970 (UTC).
 * @returns The run in progress, with every moment as a UTC timestamp.
 */
export function toStoredRunInProgress(
	record: Run,
	run: StartedRun,
	heartbeatAt: number
): StoredRunInProgress {
	return { record, run: storedRunState(run), heartbeatAt: toUtcTimestamp(heartbeatAt) };
}

/**
 * Restores the run in progress from storage, paused at its last heartbeat.
 *
 * @remarks
 * The app may have stopped at any moment after the heartbeat, so time after it doesn't count, and
 * the run is paused there with the engine's own `pause`: a running work period ends its stretch
 * at the heartbeat, and a running break keeps the time it had left then. A paused run, a break
 * that was already over and an ended run come back as they were.
 *
 * @param stored - The run in progress, as storage keeps it.
 * @param routines - The saved routines, which include the run's routine unless it was deleted.
 * @returns The restored run with its routine and record, or `null` if its routine isn't among
 * `routines`.
 */
export function restoreRunInProgress(
	stored: StoredRunInProgress,
	routines: readonly Routine[]
): RestoredRun | null {
	const routine = routines.find((candidate) => candidate.id === stored.record.routineId);
	if (routine === undefined) {
		return null;
	}

	const run = runFromStored(stored.run, routine);
	const heartbeatMs = fromUtcTimestamp(stored.heartbeatAt);
	return { routine, record: stored.record, run: pause(run, heartbeatMs) };
}

/**
 * Converts a started run from the engine's shape to storage's.
 *
 * @param run - The run, from the engine.
 * @returns The run without its routine, with every moment as a UTC timestamp.
 */
function storedRunState(run: StartedRun): StoredRunState {
	const endedPeriods = run.endedPeriods.map(storedEndedPeriod);

	switch (run.status) {
		case 'working':
			return {
				status: 'working',
				endedPeriods,
				position: run.position,
				segments: run.segments.map(storedSegment),
				runningSince: storedMoment(run.runningSince)
			};
		case 'break':
			return {
				status: 'break',
				endedPeriods,
				position: run.position,
				nextWorkPosition: run.nextWorkPosition,
				earnedMs: run.earnedMs,
				remainingMs: run.remainingMs,
				runningSince: storedMoment(run.runningSince)
			};
		case 'ended':
			return { status: 'ended', endedPeriods, outcome: run.outcome };
	}
}

/**
 * Converts a started run from storage's shape back to the engine's, undoing
 * {@link storedRunState}.
 *
 * @param stored - The run, as storage keeps it.
 * @param routine - The routine the run belongs to, which becomes its plan.
 * @returns The run as the engine had it when it was saved.
 */
function runFromStored(stored: StoredRunState, routine: Routine): StartedRun {
	const endedPeriods = stored.endedPeriods.map(endedPeriodFromStored);

	switch (stored.status) {
		case 'working':
			return {
				status: 'working',
				plan: routine,
				endedPeriods,
				position: stored.position,
				segments: stored.segments.map(segmentFromStored),
				runningSince: momentFromStored(stored.runningSince)
			};
		case 'break':
			return {
				status: 'break',
				plan: routine,
				endedPeriods,
				position: stored.position,
				nextWorkPosition: stored.nextWorkPosition,
				earnedMs: stored.earnedMs,
				remainingMs: stored.remainingMs,
				runningSince: momentFromStored(stored.runningSince)
			};
		case 'ended':
			return { status: 'ended', plan: routine, endedPeriods, outcome: stored.outcome };
	}
}

/**
 * Converts an ended work period from the engine's shape to storage's.
 *
 * @param period - The work period, from the engine.
 * @returns The same work period, with its stretches as UTC timestamps.
 */
function storedEndedPeriod(period: EndedWorkPeriod): StoredEndedWorkPeriod {
	return {
		position: period.position,
		targetMinutes: period.targetMinutes,
		segments: period.segments.map(storedSegment),
		workedMs: period.workedMs
	};
}

/**
 * Converts an ended work period from storage's shape back to the engine's.
 *
 * @param period - The work period, as storage keeps it.
 * @returns The same work period, with its stretches in milliseconds since 1970 (UTC).
 */
function endedPeriodFromStored(period: StoredEndedWorkPeriod): EndedWorkPeriod {
	return {
		position: period.position,
		targetMinutes: period.targetMinutes,
		segments: period.segments.map(segmentFromStored),
		workedMs: period.workedMs
	};
}

/**
 * Converts a moment that may be missing, such as when a paused timer's stretch started, to a UTC
 * timestamp.
 *
 * @param ms - The moment, in milliseconds since 1970 (UTC), or `null` while paused.
 * @returns The moment as a UTC timestamp, or `null` when there's none.
 */
function storedMoment(ms: number | null): string | null {
	return ms === null ? null : toUtcTimestamp(ms);
}

/**
 * Converts a moment that may be missing from a UTC timestamp back to milliseconds.
 *
 * @param timestamp - The moment as a UTC timestamp, or `null` while paused.
 * @returns The moment, in milliseconds since 1970 (UTC), or `null` when there's none.
 */
function momentFromStored(timestamp: string | null): number | null {
	return timestamp === null ? null : fromUtcTimestamp(timestamp);
}
