// When a run's next chime is due: when its work period reaches its target, or when its break
// reaches 0:00. Worked out from the run's saved timestamps alone, so the answer is the same
// however often it's asked, and the player can schedule the chime ahead on the audio clock.

import { blockAt, workedMs, type BreakRun, type RunState, type WorkingRun } from './run';
import { minutesToMs } from './time';

/**
 * The alerts that sound a chime, each with its own chime in Settings: `target` when a work period
 * reaches its target, and `break` when a break reaches 0:00.
 */
export type ChimeAlert = 'target' | 'break';

/** A chime still to sound, and when. */
export type DueChime = {
	/** The alert it's for, which decides the chime it plays. */
	readonly alert: ChimeAlert;
	/** When it's due, in milliseconds since 1970 (UTC), the same as `Date.now()` gives. */
	readonly at: number;
};

/**
 * Works out the run's next chime, if one is still to sound.
 *
 * @remarks
 * A run has at most one chime ahead of it: a running work period's target, or the end of a
 * running break. Nothing is due while paused, since a paused timer reaches nothing, nor before
 * Play or once the run has ended. Each later work period gets its chime once Play or Next starts
 * it, so an infinite routine is no different from a finite one.
 *
 * The moment comes from when the current stretch started and the time already counted before it,
 * never from `now`, so asking every second gives the same answer as asking once. `now` only
 * decides whether the moment is still ahead: a chime whose moment has come is left out, so work
 * already in overtime, or a break already over, never chimes again after a restore or a change in
 * another tab. That makes a break of 0 seconds silent, since it's over as it starts. A break
 * that earned 0 seconds but carries a bank isn't, since it lasts as long as the bank.
 *
 * @param run - The run.
 * @param now - The current moment, in milliseconds since 1970 (UTC).
 * @returns The chime still to sound, with its alert and moment, or `null` when none is.
 */
export function nextChime(run: RunState, now: number): DueChime | null {
	switch (run.status) {
		case 'working':
			return targetChime(run, now);
		case 'break':
			return breakOverChime(run, now);
		case 'ready':
		case 'ended':
			return null;
	}
}

/**
 * Works out when a running work period reaches its block's target.
 *
 * @param run - The run, in a work period.
 * @param now - The current moment, in milliseconds since 1970 (UTC).
 * @returns The target chime, or `null` while paused or once the target has been reached.
 */
function targetChime(run: WorkingRun, now: number): DueChime | null {
	if (run.runningSince === null) {
		return null;
	}
	const targetMs = minutesToMs(blockAt(run.plan, run.position).targetMinutes);
	const workedBeforeStretchMs = workedMs(run.segments, null, now);
	const targetAt = run.runningSince + targetMs - workedBeforeStretchMs;
	return chimeIfAhead('target', targetAt, now);
}

/**
 * Works out when a running break reaches 0:00.
 *
 * @param run - The run, on a break.
 * @param now - The current moment, in milliseconds since 1970 (UTC).
 * @returns The break chime, or `null` while paused or once the break is over.
 */
function breakOverChime(run: BreakRun, now: number): DueChime | null {
	if (run.runningSince === null) {
		return null;
	}
	const overAt = run.runningSince + run.remainingMs;
	return chimeIfAhead('break', overAt, now);
}

/**
 * Keeps a chime only while its moment is still ahead.
 *
 * @param alert - The alert the chime is for.
 * @param at - When it's due, in milliseconds since 1970 (UTC).
 * @param now - The current moment, in milliseconds since 1970 (UTC).
 * @returns The chime, or `null` when its moment is now or has passed, since what it marks has
 * already happened.
 */
function chimeIfAhead(alert: ChimeAlert, at: number, now: number): DueChime | null {
	const isAhead = at > now;
	return isAhead ? { alert, at } : null;
}
