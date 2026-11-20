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
	/**
	 * The unused break carried into this work period, in whole seconds, as milliseconds. Rows saved
	 * before schema version 5 lack it, and its upgrade sets it to 0.
	 */
	bankedMs: number;
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
	/**
	 * Which change to the run this row holds: a new unique id with every change, but not with a
	 * heartbeat, which changes only `heartbeatAt`.
	 *
	 * @remarks
	 * Every tab shares the one row, and each change is saved only if the row still has the
	 * revision the change was worked out from, so a tab that hasn't yet seen another's press can't
	 * overwrite it. A unique id rather than a count, so two tabs can never make the same revision,
	 * and a change worked out from a refused one is refused too. A row saved before revisions
	 * existed gets {@link VERSION_1_REVISION} when the database is upgraded.
	 */
	revision: string;
};

/**
 * The revision given to the run in progress saved by schema version 1, which had none, when the
 * database is upgraded. Every later save makes a new unique id, so it never comes back.
 */
export const VERSION_1_REVISION = 'version-1';

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
 * @param revision - A new unique id for this change, as {@link StoredRunInProgress} explains.
 * @returns The run in progress, with every moment as a UTC timestamp.
 */
export function toStoredRunInProgress(
	record: Run,
	run: StartedRun,
	heartbeatAt: number,
	revision: string
): StoredRunInProgress {
	return { record, run: storedRunState(run), heartbeatAt: toUtcTimestamp(heartbeatAt), revision };
}

/**
 * Takes on the run in progress from storage exactly as it was saved, as a tab does when another
 * tab that's still open changed it.
 *
 * @remarks
 * A running timer carries on running, since its times come from timestamps and the tab that
 * saved it is still open.
 *
 * @param stored - The run in progress, as storage keeps it.
 * @param routines - The saved routines, which include the run's routine unless it was deleted.
 * @returns The run with its routine and record, or `null` if its routine isn't among `routines`.
 */
export function followRunInProgress(
	stored: StoredRunInProgress,
	routines: readonly Routine[]
): RestoredRun | null {
	const routine = routines.find((candidate) => candidate.id === stored.record.routineId);
	if (routine === undefined) {
		return null;
	}

	return { routine, record: stored.record, run: runFromStored(stored.run, routine) };
}

/**
 * Restores the run in progress from storage, paused at its last heartbeat, as the app does when
 * it opens with no other tab open.
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
	const followed = followRunInProgress(stored, routines);
	if (followed === null) {
		return null;
	}

	const heartbeatMs = fromUtcTimestamp(stored.heartbeatAt);
	return { ...followed, run: pause(followed.run, heartbeatMs) };
}

/**
 * Says whether the saved run in progress is the one a change was worked out from, so the change
 * may replace it.
 *
 * @param saved - The run in progress storage holds, or `null` when it holds none.
 * @param basedOn - The revision the change was worked out from, or `null` if it was worked out
 * with no run in progress saved.
 * @returns `true` if `saved` has that revision, or if both are missing.
 */
export function isRevision(saved: StoredRunInProgress | null, basedOn: string | null): boolean {
	const savedRevision = saved === null ? null : saved.revision;
	return savedRevision === basedOn;
}

/**
 * Moves the saved run in progress's heartbeat on, if the row is still the change the heartbeat
 * was taken for.
 *
 * @remarks
 * A heartbeat only ever records that the app was still open, so it changes nothing but
 * `heartbeatAt`, and never the run, which another tab may have changed since. It's dropped when
 * the row has another revision, since a tab that hasn't yet seen another's press has nothing to
 * add to it, and when it isn't later than the one saved, so two open tabs' heartbeats arriving
 * out of order can't move it back.
 *
 * @param saved - The run in progress storage holds, or `null` when it holds none.
 * @param revision - The revision of the row the heartbeat was taken for.
 * @param heartbeatAt - The heartbeat's moment, as a UTC timestamp.
 * @returns The row with the new heartbeat, or `null` when it's dropped and the row stays as it is.
 */
export function withHeartbeat(
	saved: StoredRunInProgress | null,
	revision: string,
	heartbeatAt: string
): StoredRunInProgress | null {
	if (saved === null || saved.revision !== revision) {
		return null;
	}

	const isLater = fromUtcTimestamp(heartbeatAt) > fromUtcTimestamp(saved.heartbeatAt);
	return isLater ? { ...saved, heartbeatAt } : null;
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
				runningSince: storedMoment(run.runningSince),
				bankedMs: run.bankedMs
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
				runningSince: momentFromStored(stored.runningSince),
				bankedMs: stored.bankedMs
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
