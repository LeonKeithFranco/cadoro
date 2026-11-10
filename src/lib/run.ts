// The run engine: moving through a routine's rounds, blocks and cycles. Every function here is
// pure, so the screen and the tests drive it the same way.

import { percentOf } from './percent';
import type { Routine } from './routine';
import { MS_PER_SECOND, minutesToMs } from './time';

/** The parts of a routine that decide the order a run goes through it. */
export type RoutinePlan = Pick<Routine, 'rounds' | 'blocks'>;

/**
 * Where a run is within its routine: which work period, and the break that follows it.
 *
 * @remarks
 * Each part counts from 0, as array indexes do. Labels shown to the user add 1.
 */
export type Position = {
	/** The pass through all the blocks, from 0. It has no limit in an infinite routine. */
	readonly round: number;
	/** The block within the round, from 0. */
	readonly block: number;
	/** The cycle within the block, from 0. */
	readonly cycle: number;
};

/**
 * One unpaused stretch of a work period, as moments in milliseconds since 1970 (UTC), the
 * same as `Date.now()` gives.
 */
export type Segment = {
	/** When the stretch started, by Play or by the work period starting. */
	readonly start: number;
	/** When the stretch ended, by Pause, Next or Finish. */
	readonly end: number;
};

/**
 * Works out how long a work period has been worked, from its timestamps.
 *
 * @remarks
 * Time comes from the moments work started and stopped, never from counting timer ticks, so it
 * stays exact when the browser slows or suspends the page. Paused time isn't in any segment, so
 * it never counts as work.
 *
 * @param segments - The stretches already ended by Pause.
 * @param runningSince - When the current stretch started, or `null` while paused.
 * @param now - The current moment, in milliseconds since 1970 (UTC).
 * @returns The time worked, in milliseconds, at full precision. A current stretch that would be
 * negative, because the device's clock moved back, counts as 0.
 */
export function workedMs(
	segments: readonly Segment[],
	runningSince: number | null,
	now: number
): number {
	let endedMs = 0;
	for (const segment of segments) {
		endedMs += segment.end - segment.start;
	}

	return endedMs + runningStretchMs(runningSince, now);
}

/**
 * Works out how long the current unpaused stretch of a work period or break has run.
 *
 * @param runningSince - When the stretch started, or `null` while paused.
 * @param now - The current moment, in milliseconds since 1970 (UTC).
 * @returns The stretch's length in milliseconds, or 0 while paused.
 */
function runningStretchMs(runningSince: number | null, now: number): number {
	const isRunning = runningSince !== null;
	// The device's clock can move back, such as when it syncs, which would make this negative.
	return isRunning ? Math.max(0, now - runningSince) : 0;
}

/**
 * Works out the break a work period has earned.
 *
 * @remarks
 * The break is the time worked times the block's break percentage, with no cap or minimum. It's
 * rounded once, to the nearest whole second, with halves rounded up.
 *
 * @param workMs - The time worked, in milliseconds.
 * @param breakPercent - The block's break percentage, a whole number from 1 to 100.
 * @returns The break earned, in whole seconds, as milliseconds.
 */
export function earnedBreakMs(workMs: number, breakPercent: number): number {
	const earnedMs = percentOf(workMs, breakPercent);
	const earnedSeconds = Math.round(earnedMs / MS_PER_SECOND);
	return earnedSeconds * MS_PER_SECOND;
}

/** Where every run starts: the first cycle of the first block in the first round. */
export const firstPosition: Position = { round: 0, block: 0, cycle: 0 };

/**
 * Finds the work period that comes after the given one.
 *
 * @remarks
 * A run goes through block 1's cycles, then block 2's, and so on to the last block, which makes
 * one round. Then the next round starts at block 1, until a finite routine runs out of rounds.
 *
 * @param plan - The routine being run.
 * @param position - The current work period.
 * @returns The next work period, or `null` when the current one is a finite routine's last.
 */
export function nextPosition(plan: RoutinePlan, position: Position): Position | null {
	const { round, block, cycle } = position;
	const nextRound = round + 1;
	const nextBlock = block + 1;
	const nextCycle = cycle + 1;

	const blockHasNextCycle = nextCycle < plan.blocks[block].cycles;
	const roundHasNextBlock = nextBlock < plan.blocks.length;
	const routineHasNextRound = plan.rounds === 'infinite' || nextRound < plan.rounds;

	if (blockHasNextCycle) {
		return { round, block, cycle: nextCycle };
	}
	if (roundHasNextBlock) {
		return { round, block: nextBlock, cycle: 0 };
	}
	if (routineHasNextRound) {
		return { round: nextRound, block: 0, cycle: 0 };
	}
	return null;
}

/**
 * Describes where a run is, such as "Round 2 of 4 · Block 2 of 3 · Cycle 1 of 3".
 *
 * @remarks
 * A part whose total is 1, such as the block in a one-block routine, is left out, because it
 * never changes. An infinite routine always shows its round, with no total, such as "Round 5".
 *
 * @param plan - The routine being run.
 * @param position - The current work period.
 * @returns The parts that can change, joined by " · ". It's empty for a finite routine of one
 * round, one block and one cycle.
 */
export function positionLabel(plan: RoutinePlan, position: Position): string {
	// Positions count from 0, as array indexes do, while the user counts from 1.
	const roundNumber = position.round + 1;
	const blockNumber = position.block + 1;
	const cycleNumber = position.cycle + 1;
	const blockCount = plan.blocks.length;
	const cycleCount = plan.blocks[position.block].cycles;

	const parts: string[] = [];
	if (plan.rounds === 'infinite') {
		parts.push(`Round ${roundNumber}`);
	} else if (plan.rounds > 1) {
		parts.push(`Round ${roundNumber} of ${plan.rounds}`);
	}
	if (blockCount > 1) {
		parts.push(`Block ${blockNumber} of ${blockCount}`);
	}
	if (cycleCount > 1) {
		parts.push(`Cycle ${cycleNumber} of ${cycleCount}`);
	}

	return parts.join(' · ');
}

/** A work period that has ended, by Next or by Finish. */
export type EndedWorkPeriod = {
	/** Where it was in the routine. */
	readonly position: Position;
	/** Its block's target when it ran, in whole minutes, so later edits don't change history. */
	readonly targetMinutes: number;
	/** Its unpaused stretches, in order. */
	readonly segments: readonly Segment[];
	/** The time worked, the sum of the segments, in milliseconds. */
	readonly workedMs: number;
};

/** A run before Play is pressed: the routine is chosen, and nothing has started. */
export type ReadyRun = {
	/** Marks the run as not started yet. */
	readonly status: 'ready';
	/** The routine to run. */
	readonly plan: RoutinePlan;
};

/** A run during a work period, which counts up, running or paused. */
export type WorkingRun = {
	/** Marks the run as in a work period. */
	readonly status: 'working';
	/** The routine being run. */
	readonly plan: RoutinePlan;
	/** The work periods this run has already ended, in order. */
	readonly endedPeriods: readonly EndedWorkPeriod[];
	/** Where this work period is in the routine. */
	readonly position: Position;
	/** This work period's stretches already ended by Pause. */
	readonly segments: readonly Segment[];
	/** When the current stretch started, or `null` while paused. */
	readonly runningSince: number | null;
};

/** A run during a break, which counts down, running, paused or over. */
export type BreakRun = {
	/** Marks the run as on a break. */
	readonly status: 'break';
	/** The routine being run. */
	readonly plan: RoutinePlan;
	/** The work periods this run has ended, in order, ending with the one this break follows. */
	readonly endedPeriods: readonly EndedWorkPeriod[];
	/** Where the work period this break follows is in the routine. */
	readonly position: Position;
	/** Where the work period after this break is in the routine. */
	readonly nextWorkPosition: Position;
	/** The whole break earned, in whole seconds, as milliseconds. */
	readonly earnedMs: number;
	/** The break left when the current stretch started, or when it was paused, in milliseconds. */
	readonly remainingMs: number;
	/** When the current stretch started, or `null` while paused. */
	readonly runningSince: number | null;
};

/** A run that has ended. */
export type EndedRun = {
	/** Marks the run as over. */
	readonly status: 'ended';
	/** The routine that was run. */
	readonly plan: RoutinePlan;
	/** Every work period the run ended, in order. */
	readonly endedPeriods: readonly EndedWorkPeriod[];
	/** `completed` when its last work period ended, or `finished` when Finish was pressed. */
	readonly outcome: 'completed' | 'finished';
};

/**
 * Everything a run can be: ready, in a work period, on a break or ended.
 *
 * @remarks
 * Each kind of run has its own type, told apart by `status`, so each holds only the fields that
 * make sense for it. A break has no work segments, for example, and a ready run has no position.
 */
export type RunState = ReadyRun | WorkingRun | BreakRun | EndedRun;

/**
 * Prepares a run of a routine, before Play is pressed.
 *
 * @param plan - The routine to run.
 * @returns A run that's ready to start.
 */
export function createRun(plan: RoutinePlan): ReadyRun {
	return { status: 'ready', plan };
}

/**
 * Works out how much of a break is left.
 *
 * @param run - The run, on a break.
 * @param now - The current moment, in milliseconds since 1970 (UTC).
 * @returns The break left, in milliseconds, never below 0.
 */
export function breakRemainingMs(run: BreakRun, now: number): number {
	const remainingMs = run.remainingMs - runningStretchMs(run.runningSince, now);
	return Math.max(0, remainingMs);
}

/**
 * Presses Play: starts the run, resumes a paused work period or break, or, once a break is over,
 * starts the next work period.
 *
 * @param run - The run.
 * @param now - The current moment, in milliseconds since 1970 (UTC).
 * @returns The run after Play. A run that's already running, or that has ended, is returned as
 * it was.
 */
export function play(run: RunState, now: number): RunState {
	switch (run.status) {
		case 'ready':
			return startWork(run.plan, [], firstPosition, now);
		case 'working':
			return resume(run, now);
		case 'break':
			if (isBreakOver(run, now)) {
				return startWork(run.plan, run.endedPeriods, run.nextWorkPosition, now);
			}
			return resume(run, now);
		case 'ended':
			return run;
	}
}

/**
 * Presses Pause: stops the work period's or break's timer.
 *
 * @remarks
 * Paused time doesn't count as work, and a paused break keeps the time it had left.
 *
 * @param run - The run.
 * @param now - The current moment, in milliseconds since 1970 (UTC).
 * @returns The run after Pause. A run that isn't running, or a break that's over, is returned as
 * it was.
 */
export function pause(run: RunState, now: number): RunState {
	switch (run.status) {
		case 'working': {
			const isPaused = run.runningSince === null;
			if (isPaused) {
				return run;
			}
			return { ...run, segments: segmentsUpTo(run, now), runningSince: null };
		}
		case 'break': {
			const isPaused = run.runningSince === null;
			if (isPaused || isBreakOver(run, now)) {
				return run;
			}
			return { ...run, remainingMs: breakRemainingMs(run, now), runningSince: null };
		}
		case 'ready':
		case 'ended':
			return run;
	}
}

/**
 * Presses Next: ends a work period and starts its break, or ends a break and starts the next work
 * period.
 *
 * @remarks
 * A work period ended early still counts as a completed cycle. A break ended early loses the time
 * it had left. A finite routine's last work period ends the run instead, without its break.
 *
 * @param run - The run.
 * @param now - The current moment, in milliseconds since 1970 (UTC).
 * @returns The run after Next. A run that hasn't started, or that has ended, is returned as it
 * was.
 */
export function next(run: RunState, now: number): RunState {
	switch (run.status) {
		case 'working':
			return endWorkPeriod(run, now);
		case 'break':
			return startWork(run.plan, run.endedPeriods, run.nextWorkPosition, now);
		case 'ready':
		case 'ended':
			return run;
	}
}

/**
 * Presses Finish, once confirmed: ends the run.
 *
 * @remarks
 * The current work period, if any, is saved up to now, however short. A break in progress is
 * dropped, since breaks aren't recorded. This is how an infinite routine ends, and how a finite
 * one ends early.
 *
 * @param run - The run.
 * @param now - The current moment, in milliseconds since 1970 (UTC).
 * @returns The run, finished. A run that hasn't started, or that has ended, is returned as it
 * was.
 */
export function finish(run: RunState, now: number): RunState {
	switch (run.status) {
		case 'working': {
			const endedPeriods = [...run.endedPeriods, currentPeriodUpTo(run, now)];
			return endRun(run.plan, endedPeriods, 'finished');
		}
		case 'break':
			return endRun(run.plan, run.endedPeriods, 'finished');
		case 'ready':
		case 'ended':
			return run;
	}
}

/** What the timer's controls show, for every kind of run. */
type ControlsView = {
	/** Whether a timer is counting, so the Play button shows Pause. */
	readonly isRunning: boolean;
	/** Whether the run has started and not yet ended, so Next and Finish can be pressed. */
	readonly isInProgress: boolean;
};

/** What the timer screen shows before Play is pressed. */
export type ReadyView = ControlsView & {
	/** Marks the view of a run not started yet. */
	readonly status: 'ready';
	/** Where the run will start, such as "Round 1 · Block 1 of 2 · Cycle 1 of 3". */
	readonly label: string;
};

/** What the timer screen shows during a work period. */
export type WorkView = ControlsView & {
	/** Marks the view of a run in a work period. */
	readonly status: 'working';
	/** The block whose work timer is active, counting from 0. */
	readonly block: number;
	/** Where the run is, such as "Round 2 of 4 · Block 2 of 3 · Cycle 1 of 3". */
	readonly label: string;
	/** The time worked so far in this work period, in milliseconds. */
	readonly workedMs: number;
	/** The block's target, in milliseconds. */
	readonly targetMs: number;
	/** Whether the work has reached its target, so the timer shows overtime. */
	readonly isOvertime: boolean;
	/** The break earned so far, which grows as the work goes on, in whole seconds, as milliseconds. */
	readonly breakEarnedMs: number;
};

/** What the timer screen shows during a break. */
export type BreakView = ControlsView & {
	/** Marks the view of a run on a break. */
	readonly status: 'break';
	/** The block whose break timer is active, counting from 0. */
	readonly block: number;
	/** Where the run is: the work period this break follows. */
	readonly label: string;
	/** The whole break earned, in whole seconds, as milliseconds. */
	readonly earnedMs: number;
	/** The break left, in milliseconds. */
	readonly remainingMs: number;
	/** Whether the break has reached 0:00, so Play starts the next work period. */
	readonly isOver: boolean;
};

/** What the timer screen shows once a run has ended. */
export type EndedView = ControlsView & {
	/** Marks the view of a run that has ended. */
	readonly status: 'ended';
	/** The totals for the run summary. */
	readonly summary: RunSummary;
};

/**
 * Everything the timer screen shows about a run at one moment.
 *
 * @remarks
 * Like the run itself, each kind of view is its own type, told apart by `status`.
 */
export type RunView = ReadyView | WorkView | BreakView | EndedView;

/** The totals the run summary shows once a run ends. */
export type RunSummary = {
	/** The time worked across the whole run, in milliseconds. */
	readonly totalWorkMs: number;
	/** The work periods the run saved, including one that Finish ended early. */
	readonly periodsCompleted: number;
	/** The rounds the run reached, counting the round it ended in. */
	readonly roundsReached: number;
	/** The time worked past each work period's target, added up, in milliseconds. */
	readonly overtimeMs: number;
};

/**
 * Works out everything the timer screen shows about a run at this moment.
 *
 * @remarks
 * The screen calls this on every redraw, with the current time, and shows the result as it is,
 * so the rules for what it shows live here rather than in the screen.
 *
 * @param run - The run.
 * @param now - The current moment, in milliseconds since 1970 (UTC).
 * @returns The run's view at this moment.
 */
export function viewRun(run: RunState, now: number): RunView {
	switch (run.status) {
		case 'ready':
			return {
				status: 'ready',
				label: positionLabel(run.plan, firstPosition),
				isRunning: false,
				isInProgress: false
			};
		case 'working': {
			const block = run.plan.blocks[run.position.block];
			const workedSoFarMs = workedMs(run.segments, run.runningSince, now);
			const targetMs = minutesToMs(block.targetMinutes);
			return {
				status: 'working',
				block: run.position.block,
				label: positionLabel(run.plan, run.position),
				workedMs: workedSoFarMs,
				targetMs,
				isOvertime: workedSoFarMs >= targetMs,
				breakEarnedMs: earnedBreakMs(workedSoFarMs, block.breakPercent),
				isRunning: run.runningSince !== null,
				isInProgress: true
			};
		}
		case 'break': {
			const isOver = isBreakOver(run, now);
			const isPaused = run.runningSince === null;
			return {
				status: 'break',
				block: run.position.block,
				label: positionLabel(run.plan, run.position),
				earnedMs: run.earnedMs,
				remainingMs: breakRemainingMs(run, now),
				isOver,
				// A break at 0:00 waits for Play, so it shows as not running.
				isRunning: !isPaused && !isOver,
				isInProgress: true
			};
		}
		case 'ended':
			return {
				status: 'ended',
				summary: summarizeRun(run),
				isRunning: false,
				isInProgress: false
			};
	}
}

/**
 * Works out the totals for a run's summary.
 *
 * @param run - The run, ended.
 * @returns The run's total work, work periods, rounds reached and overtime.
 */
export function summarizeRun(run: EndedRun): RunSummary {
	let totalWorkMs = 0;
	let overtimeMs = 0;
	for (const period of run.endedPeriods) {
		totalWorkMs += period.workedMs;
		overtimeMs += overtimeOf(period);
	}

	const lastPeriod = run.endedPeriods.at(-1);
	// Positions count rounds from 0, so round 0 is the first round reached.
	const roundsReached = lastPeriod === undefined ? 0 : lastPeriod.position.round + 1;

	return { totalWorkMs, periodsCompleted: run.endedPeriods.length, roundsReached, overtimeMs };
}

/**
 * Works out how long a work period ran past its target.
 *
 * @param period - The ended work period.
 * @returns The time worked past the target, in milliseconds, or 0 if it ended before the target.
 */
function overtimeOf(period: EndedWorkPeriod): number {
	const targetMs = minutesToMs(period.targetMinutes);
	return Math.max(0, period.workedMs - targetMs);
}

/**
 * Checks whether a break has reached 0:00.
 *
 * @param run - The run, on a break.
 * @param now - The current moment, in milliseconds since 1970 (UTC).
 * @returns Whether none of the break is left.
 */
function isBreakOver(run: BreakRun, now: number): boolean {
	return breakRemainingMs(run, now) === 0;
}

/**
 * Ends a run, keeping the work periods it ended.
 *
 * @param plan - The routine that was run.
 * @param endedPeriods - Every work period the run ended, in order.
 * @param outcome - `completed` when its last work period ended, or `finished` by Finish.
 * @returns The ended run.
 */
function endRun(
	plan: RoutinePlan,
	endedPeriods: readonly EndedWorkPeriod[],
	outcome: EndedRun['outcome']
): EndedRun {
	return { status: 'ended', plan, endedPeriods, outcome };
}

/**
 * Starts a work period, running from now.
 *
 * @param plan - The routine being run.
 * @param endedPeriods - The work periods the run has already ended.
 * @param position - Where the new work period is in the routine.
 * @param now - The current moment, in milliseconds since 1970 (UTC).
 * @returns The run in its new work period.
 */
function startWork(
	plan: RoutinePlan,
	endedPeriods: readonly EndedWorkPeriod[],
	position: Position,
	now: number
): WorkingRun {
	return { status: 'working', plan, endedPeriods, position, segments: [], runningSince: now };
}

/**
 * Restarts a paused work period's or break's timer from now.
 *
 * @typeParam Run - Whether it's a work period or a break, which the result keeps.
 * @param run - The run, in a work period or on a break.
 * @param now - The current moment, in milliseconds since 1970 (UTC).
 * @returns The run, running again, or as it was if it was already running.
 */
function resume<Run extends WorkingRun | BreakRun>(run: Run, now: number): Run {
	const isPaused = run.runningSince === null;
	return isPaused ? { ...run, runningSince: now } : run;
}

/**
 * Lists a work period's stretches, with the current one, if it's running, ending now.
 *
 * @param run - The run, in a work period.
 * @param now - The current moment, in milliseconds since 1970 (UTC).
 * @returns The stretches up to now, in order.
 */
function segmentsUpTo(run: WorkingRun, now: number): readonly Segment[] {
	if (run.runningSince === null) {
		return run.segments;
	}
	// The device's clock can move back, which would end the stretch before it started.
	const currentStretch = { start: run.runningSince, end: Math.max(run.runningSince, now) };
	return [...run.segments, currentStretch];
}

/**
 * Records the current work period as it stands now, however short, as Next and Finish save it.
 *
 * @param run - The run, in a work period.
 * @param now - The current moment, in milliseconds since 1970 (UTC).
 * @returns The work period, with its stretches up to now and its block's target.
 */
function currentPeriodUpTo(run: WorkingRun, now: number): EndedWorkPeriod {
	const block = run.plan.blocks[run.position.block];
	const segments = segmentsUpTo(run, now);
	return {
		position: run.position,
		targetMinutes: block.targetMinutes,
		segments,
		workedMs: workedMs(segments, null, now)
	};
}

/**
 * Ends a work period and starts its break, or ends the run after a finite routine's last work
 * period.
 *
 * @param run - The run, in a work period.
 * @param now - The current moment, in milliseconds since 1970 (UTC).
 * @returns The run on the work period's break, running from now, or the run completed.
 */
function endWorkPeriod(run: WorkingRun, now: number): BreakRun | EndedRun {
	const block = run.plan.blocks[run.position.block];
	const endedPeriod = currentPeriodUpTo(run, now);
	const endedPeriods = [...run.endedPeriods, endedPeriod];

	const nextWorkPosition = nextPosition(run.plan, run.position);
	const wasLastWorkPeriod = nextWorkPosition === null;
	if (wasLastWorkPeriod) {
		return endRun(run.plan, endedPeriods, 'completed');
	}

	const earnedMs = earnedBreakMs(endedPeriod.workedMs, block.breakPercent);
	return {
		status: 'break',
		plan: run.plan,
		endedPeriods,
		position: run.position,
		nextWorkPosition,
		earnedMs,
		remainingMs: earnedMs,
		runningSince: now
	};
}
