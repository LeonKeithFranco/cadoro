import { describe, expect, it } from 'vitest';
import { createStarterRoutines, type Block } from './routine';
import {
	breakRemainingMs,
	createRun,
	earnedBreakMs,
	finish,
	firstPosition,
	next,
	nextPosition,
	pause,
	play,
	positionLabel,
	summarizeRun,
	viewRun,
	workedMs,
	type EndedRun,
	type Position,
	type RoutinePlan,
	type RunState,
	type WorkingRun
} from './run';
import { hours, minutes, seconds } from './testing/durations';

/**
 * Builds a routine plan with blocks that differ only in their number of cycles, which is all
 * that decides the order of a run.
 *
 * @param rounds - The routine's rounds, or `'infinite'`.
 * @param cycles - Each block's number of cycles, in run order.
 * @returns A plan with one 25-minute block at 20% for each entry in `cycles`.
 */
function plan(rounds: RoutinePlan['rounds'], ...cycles: number[]): RoutinePlan {
	const blocks: Block[] = cycles.map((count, index) => ({
		id: `block-${index + 1}`,
		title: `Block ${index + 1}`,
		targetMinutes: 25,
		breakPercent: 20,
		cycles: count
	}));
	return { rounds, blocks };
}

/**
 * Lists every work period a run goes through, from the first until `nextPosition` returns
 * `null`, or until `limit` positions for an infinite routine.
 *
 * @param routine - The routine to walk through.
 * @param limit - The most positions to list, so an infinite routine stops.
 * @returns The positions in run order.
 */
function walk(routine: RoutinePlan, limit = 100): Position[] {
	const positions: Position[] = [];
	let position: Position | null = firstPosition;
	while (position && positions.length < limit) {
		positions.push(position);
		position = nextPosition(routine, position);
	}
	return positions;
}

/**
 * Checks that a run is in the expected state, and returns it typed as that state, so a test can
 * read the fields only that state has.
 *
 * @typeParam Status - The status the run should have.
 * @param run - The run to check.
 * @param status - The status the run should have.
 * @returns The run, typed as the state with that status.
 * @throws {@link Error}
 * When the run has a different status, which fails the test.
 */
function inStatus<Status extends RunState['status']>(
	run: RunState,
	status: Status
): Extract<RunState, { status: Status }> {
	if (run.status !== status) {
		throw new Error(`Expected the run to be ${status}, but it's ${run.status}`);
	}
	return run as Extract<RunState, { status: Status }>;
}

/** The starter routine whose blocks earn different breaks: 3 cycles at 20%, then 1 at 60%. */
const [, classicWithLongBreak] = createStarterRoutines(new Date(0), () => 'id');

/**
 * Puts a run straight into a work period of Classic with long break, running from 0.
 *
 * @param position - Where the work period is in the routine.
 * @returns The run, in that work period, with nothing ended yet.
 */
function workingAt(position: Position): WorkingRun {
	return {
		status: 'working',
		plan: classicWithLongBreak,
		endedPeriods: [],
		position,
		segments: [],
		runningSince: 0
	};
}

describe('workedMs', () => {
	it('is 0 before any work', () => {
		expect(workedMs([], null, 5_000)).toBe(0);
	});

	it('counts the running stretch up to now', () => {
		expect(workedMs([], 10_000, 70_000)).toBe(60_000);
	});

	it('adds up the ended segments, leaving out the paused time between them', () => {
		const segments = [
			{ start: 0, end: 1_000 },
			{ start: 5_000, end: 8_000 }
		];

		expect(workedMs(segments, null, 20_000)).toBe(4_000);
	});

	it('adds the running stretch to the ended segments', () => {
		expect(workedMs([{ start: 0, end: 1_000 }], 5_000, 7_500)).toBe(3_500);
	});

	it('keeps every millisecond rather than rounding to seconds', () => {
		expect(workedMs([{ start: 0, end: 1_499 }], null, 2_000)).toBe(1_499);
	});

	it("counts the running stretch as 0 when the device's clock has moved back", () => {
		expect(workedMs([{ start: 0, end: 500 }], 10_000, 9_000)).toBe(500);
	});
});

describe('earnedBreakMs', () => {
	it.each<[rule: string, worked: number, breakPercent: number, earned: number]>([
		['earns 5 minutes for 25 minutes at 20%', minutes(25), 20, minutes(5)],
		['earns 15 minutes for 25 minutes at 60%', minutes(25), 60, minutes(15)],
		[
			'earns from the time worked, past the target',
			minutes(31) + seconds(40),
			20,
			minutes(6) + seconds(20)
		],
		['rounds an exact half second up', 2_500, 20, 1_000],
		['rounds just below a half second down', 2_499, 20, 0],
		['earns no break for a few seconds of work', 1_000, 20, 0],
		['earns nothing for no work', 0, 20, 0],
		[
			'rounds a half up where dividing the percentage first would round it down',
			50_000,
			29,
			15_000
		],
		['gives the time worked, rounded, at 100%', 61_500, 100, 62_000],
		['has no cap', hours(4), 100, hours(4)]
	])('%s', (_rule, worked, breakPercent, earned) => {
		expect(earnedBreakMs(worked, breakPercent)).toBe(earned);
	});
});

describe('firstPosition', () => {
	it('is the first cycle of the first block in the first round', () => {
		expect(firstPosition).toEqual({ round: 0, block: 0, cycle: 0 });
	});
});

describe('nextPosition', () => {
	it("goes through each block's cycles, then the next block, then the next round, then ends", () => {
		expect(walk(plan(2, 2, 1))).toEqual([
			{ round: 0, block: 0, cycle: 0 },
			{ round: 0, block: 0, cycle: 1 },
			{ round: 0, block: 1, cycle: 0 },
			{ round: 1, block: 0, cycle: 0 },
			{ round: 1, block: 0, cycle: 1 },
			{ round: 1, block: 1, cycle: 0 }
		]);
	});

	it('ends a one-round, one-block, one-cycle routine after its only work period', () => {
		expect(nextPosition(plan(1, 1), firstPosition)).toBeNull();
	});

	it('repeats a one-block, one-cycle infinite routine round after round', () => {
		expect(walk(plan('infinite', 1), 3)).toEqual([
			{ round: 0, block: 0, cycle: 0 },
			{ round: 1, block: 0, cycle: 0 },
			{ round: 2, block: 0, cycle: 0 }
		]);
	});

	it('never ends an infinite routine, even past 99 rounds', () => {
		expect(nextPosition(plan('infinite', 3, 1), { round: 150, block: 1, cycle: 0 })).toEqual({
			round: 151,
			block: 0,
			cycle: 0
		});
	});
});

describe('positionLabel', () => {
	it.each<[rule: string, routine: RoutinePlan, position: Position, label: string]>([
		[
			'shows every part when every total is above 1',
			plan(4, 1, 3, 2),
			{ round: 1, block: 1, cycle: 0 },
			'Round 2 of 4 · Block 2 of 3 · Cycle 1 of 3'
		],
		[
			'shows an infinite round with no total',
			plan('infinite', 3, 1),
			{ round: 4, block: 0, cycle: 2 },
			'Round 5 · Block 1 of 2 · Cycle 3 of 3'
		],
		[
			'leaves out the cycle in a block of 1 cycle',
			plan('infinite', 3, 1),
			{ round: 1, block: 1, cycle: 0 },
			'Round 2 · Block 2 of 2'
		],
		[
			'leaves out the block and cycle in a routine of one block of 1 cycle',
			plan('infinite', 1),
			{ round: 4, block: 0, cycle: 0 },
			'Round 5'
		],
		[
			'leaves out the round in a routine of 1 round',
			plan(1, 4, 1),
			{ round: 0, block: 0, cycle: 1 },
			'Block 1 of 2 · Cycle 2 of 4'
		],
		['is empty for a routine of 1 round, 1 block and 1 cycle', plan(1, 1), firstPosition, '']
	])('%s', (_rule, routine, position, label) => {
		expect(positionLabel(routine, position)).toBe(label);
	});
});

describe('createRun', () => {
	it('is ready to start, with the routine to run', () => {
		const routine = plan('infinite', 1);

		expect(createRun(routine)).toEqual({ status: 'ready', plan: routine });
	});
});

describe('play', () => {
	it('starts the first work period, running from now', () => {
		const routine = plan('infinite', 1);

		expect(play(createRun(routine), 1_000)).toEqual({
			status: 'working',
			plan: routine,
			endedPeriods: [],
			position: firstPosition,
			segments: [],
			runningSince: 1_000
		});
	});

	it('resumes paused work without counting the paused time', () => {
		const paused = pause(play(createRun(plan('infinite', 1)), 0), 10_000);

		const resumed = inStatus(play(paused, 30_000), 'working');

		expect(workedMs(resumed.segments, resumed.runningSince, 40_000)).toBe(20_000);
	});

	it('resumes a paused break with the time it had left', () => {
		const onBreak = next(play(createRun(plan('infinite', 1)), 0), minutes(25));
		const paused = pause(onBreak, minutes(27));

		const resumed = inStatus(play(paused, minutes(37)), 'break');

		expect(breakRemainingMs(resumed, minutes(38))).toBe(minutes(2));
	});

	it('starts the next work period once the break is over', () => {
		const onBreak = next(play(createRun(plan('infinite', 1)), 0), minutes(25));

		expect(play(onBreak, minutes(31))).toMatchObject({
			status: 'working',
			position: { round: 1, block: 0, cycle: 0 },
			segments: [],
			runningSince: minutes(31)
		});
	});

	it('leaves running work, a running break and an ended run as they were', () => {
		const working = play(createRun(plan('infinite', 1)), 0);
		const onBreak = next(working, minutes(25));
		const ended = next(play(createRun(plan(1, 1)), 0), minutes(25));

		expect(play(working, 5_000)).toBe(working);
		expect(play(onBreak, minutes(26))).toBe(onBreak);
		expect(play(ended, minutes(30))).toBe(ended);
	});
});

describe('pause', () => {
	it('ends the running stretch of work as a segment', () => {
		const working = play(createRun(plan('infinite', 1)), 1_000);

		expect(pause(working, 4_000)).toMatchObject({
			status: 'working',
			segments: [{ start: 1_000, end: 4_000 }],
			runningSince: null
		});
	});

	it('keeps the time a paused break had left, however long the pause', () => {
		const onBreak = next(play(createRun(plan('infinite', 1)), 0), minutes(25));

		const paused = inStatus(pause(onBreak, minutes(27)), 'break');

		expect(breakRemainingMs(paused, minutes(27))).toBe(minutes(3));
		expect(breakRemainingMs(paused, minutes(90))).toBe(minutes(3));
	});

	it('leaves paused work, a break that is over and a run not yet started as they were', () => {
		const ready = createRun(plan('infinite', 1));
		const paused = pause(play(ready, 0), 10_000);
		const onBreak = next(play(ready, 0), minutes(25));

		expect(pause(paused, 20_000)).toBe(paused);
		expect(pause(onBreak, minutes(31))).toBe(onBreak);
		expect(pause(ready, 0)).toBe(ready);
	});
});

describe('next', () => {
	it('ends a work period and starts its earned break, running from now', () => {
		const routine = plan('infinite', 1);
		const working = play(createRun(routine), 0);

		expect(next(working, minutes(25))).toEqual({
			status: 'break',
			plan: routine,
			endedPeriods: [
				{
					position: firstPosition,
					targetMinutes: 25,
					segments: [{ start: 0, end: minutes(25) }],
					workedMs: minutes(25)
				}
			],
			position: firstPosition,
			nextWorkPosition: { round: 1, block: 0, cycle: 0 },
			earnedMs: minutes(5),
			remainingMs: minutes(5),
			runningSince: minutes(25)
		});
	});

	it('earns the break from the time worked, leaving out paused time', () => {
		const working = play(pause(play(createRun(plan('infinite', 1)), 0), minutes(10)), minutes(20));

		expect(next(working, minutes(30))).toMatchObject({ status: 'break', earnedMs: minutes(4) });
	});

	it("earns each break at the percentage of the block just worked, across a block's end", () => {
		const lastShortCycle = next(workingAt({ round: 0, block: 0, cycle: 2 }), minutes(25));
		const longBreakCycle = next(workingAt({ round: 0, block: 1, cycle: 0 }), minutes(25));

		expect(lastShortCycle).toMatchObject({
			status: 'break',
			earnedMs: minutes(5),
			nextWorkPosition: { round: 0, block: 1, cycle: 0 }
		});
		expect(longBreakCycle).toMatchObject({
			status: 'break',
			earnedMs: minutes(15),
			nextWorkPosition: { round: 1, block: 0, cycle: 0 }
		});
	});

	it('ends a break early and starts the next work period, losing the time left', () => {
		const onBreak = next(play(createRun(plan('infinite', 1)), 0), minutes(25));

		expect(next(onBreak, minutes(26))).toMatchObject({
			status: 'working',
			position: { round: 1, block: 0, cycle: 0 },
			runningSince: minutes(26)
		});
	});

	it('earns no break for a few seconds of work, so the break is over at once', () => {
		const onBreak = inStatus(next(play(createRun(plan('infinite', 1)), 0), 2_000), 'break');

		expect(onBreak.earnedMs).toBe(0);
		expect(breakRemainingMs(onBreak, 2_000)).toBe(0);
	});

	it("completes a finite routine at its last work period, without that period's break", () => {
		const firstBreak = next(play(createRun(plan(1, 2)), 0), minutes(25));
		const lastWork = next(firstBreak, minutes(30));

		const ended = inStatus(next(lastWork, minutes(55)), 'ended');

		expect(ended.outcome).toBe('completed');
		expect(ended.endedPeriods.map((period) => period.position)).toEqual([
			{ round: 0, block: 0, cycle: 0 },
			{ round: 0, block: 0, cycle: 1 }
		]);
	});

	it('leaves a run not yet started, and an ended run, as they were', () => {
		const ready = createRun(plan(1, 1));
		const ended = next(play(ready, 0), minutes(25));

		expect(next(ready, 0)).toBe(ready);
		expect(next(ended, minutes(30))).toBe(ended);
	});
});

describe('breakRemainingMs', () => {
	it('counts down while the break runs, and stops at 0', () => {
		const onBreak = inStatus(next(play(createRun(plan('infinite', 1)), 0), minutes(25)), 'break');

		expect(breakRemainingMs(onBreak, minutes(25))).toBe(minutes(5));
		expect(breakRemainingMs(onBreak, minutes(28))).toBe(minutes(2));
		expect(breakRemainingMs(onBreak, minutes(40))).toBe(0);
	});
});

describe('finish', () => {
	it('saves the work period up to now and ends the run as finished', () => {
		const routine = plan('infinite', 1);
		const working = play(createRun(routine), 0);

		expect(finish(working, minutes(10))).toEqual({
			status: 'ended',
			plan: routine,
			endedPeriods: [
				{
					position: firstPosition,
					targetMinutes: 25,
					segments: [{ start: 0, end: minutes(10) }],
					workedMs: minutes(10)
				}
			],
			outcome: 'finished'
		});
	});

	it('saves paused work without its paused time', () => {
		const paused = pause(play(createRun(plan('infinite', 1)), 0), minutes(5));

		const ended = inStatus(finish(paused, minutes(20)), 'ended');

		expect(ended.endedPeriods[0].segments).toEqual([{ start: 0, end: minutes(5) }]);
		expect(ended.endedPeriods[0].workedMs).toBe(minutes(5));
	});

	it('saves a work period of only a few seconds', () => {
		const ended = inStatus(finish(play(createRun(plan('infinite', 1)), 0), 3_000), 'ended');

		expect(ended.endedPeriods.map((period) => period.workedMs)).toEqual([3_000]);
	});

	it('drops a break in progress, keeping the work periods already ended', () => {
		const onBreak = next(play(createRun(plan('infinite', 1)), 0), minutes(25));

		const ended = inStatus(finish(onBreak, minutes(27)), 'ended');

		expect(ended.outcome).toBe('finished');
		expect(ended.endedPeriods.map((period) => period.workedMs)).toEqual([minutes(25)]);
	});

	it('leaves a run not yet started, and an ended run, as they were', () => {
		const ready = createRun(plan('infinite', 1));
		const ended = finish(play(ready, 0), minutes(10));

		expect(finish(ready, 0)).toBe(ready);
		expect(finish(ended, minutes(20))).toBe(ended);
	});
});

describe('viewRun', () => {
	it('shows where a run will start, with Next and Finish not yet available', () => {
		expect(viewRun(createRun(classicWithLongBreak), 0)).toEqual({
			status: 'ready',
			label: 'Round 1 · Block 1 of 2 · Cycle 1 of 3',
			isRunning: false,
			isInProgress: false
		});
	});

	it('shows a work period counting up, with its target and the break earned so far', () => {
		const working = workingAt({ round: 0, block: 0, cycle: 1 });

		expect(viewRun(working, minutes(10))).toEqual({
			status: 'working',
			block: 0,
			label: 'Round 1 · Block 1 of 2 · Cycle 2 of 3',
			workedMs: minutes(10),
			targetMs: minutes(25),
			isOvertime: false,
			breakEarnedMs: minutes(2),
			isRunning: true,
			isInProgress: true
		});
	});

	it('shows overtime from the moment work reaches its target, while it keeps counting', () => {
		const working = workingAt(firstPosition);

		expect(viewRun(working, minutes(25) - 1)).toMatchObject({ isOvertime: false });
		expect(viewRun(working, minutes(25))).toMatchObject({ isOvertime: true });
		expect(viewRun(working, minutes(31) + seconds(40))).toMatchObject({
			workedMs: minutes(31) + seconds(40),
			isOvertime: true,
			breakEarnedMs: minutes(6) + seconds(20)
		});
	});

	it('shows paused work as not running, with Next and Finish still available', () => {
		const paused = pause(workingAt(firstPosition), minutes(10));

		expect(viewRun(paused, minutes(20))).toMatchObject({
			workedMs: minutes(10),
			isRunning: false,
			isInProgress: true
		});
	});

	it('shows a break counting down, on the block it follows, with the time that earned it', () => {
		const onBreak = next(workingAt({ round: 0, block: 1, cycle: 0 }), minutes(25));

		expect(viewRun(onBreak, minutes(30))).toEqual({
			status: 'break',
			block: 1,
			label: 'Round 1 · Block 2 of 2',
			workedMs: minutes(25),
			earnedMs: minutes(15),
			remainingMs: minutes(10),
			isOver: false,
			isRunning: true,
			isInProgress: true
		});
	});

	it('shows a break at 0:00 as over and not running, waiting for Play', () => {
		const onBreak = next(workingAt(firstPosition), minutes(25));

		expect(viewRun(onBreak, minutes(40))).toMatchObject({
			remainingMs: 0,
			isOver: true,
			isRunning: false
		});
	});

	it('shows a paused break as not running', () => {
		const paused = pause(next(workingAt(firstPosition), minutes(25)), minutes(27));

		expect(viewRun(paused, minutes(35))).toMatchObject({
			remainingMs: minutes(3),
			isOver: false,
			isRunning: false
		});
	});

	it('shows the summary once the run has ended, with Next and Finish no longer available', () => {
		const ended = inStatus(finish(workingAt(firstPosition), minutes(10)), 'ended');

		expect(viewRun(ended, minutes(15))).toEqual({
			status: 'ended',
			summary: summarizeRun(ended),
			isRunning: false,
			isInProgress: false
		});
	});
});

describe('summarizeRun', () => {
	it('adds up the work, the work periods, the rounds reached and the overtime', () => {
		const firstBreak = next(play(createRun(plan('infinite', 1)), 0), minutes(31));
		const secondWork = next(firstBreak, minutes(37));
		const ended = inStatus(finish(secondWork, minutes(47)), 'ended');

		expect(summarizeRun(ended)).toEqual({
			totalWorkMs: minutes(41),
			periodsCompleted: 2,
			roundsReached: 2,
			overtimeMs: minutes(6)
		});
	});

	it('counts no work and no rounds for a run with no work periods', () => {
		const empty: EndedRun = {
			status: 'ended',
			plan: plan('infinite', 1),
			endedPeriods: [],
			outcome: 'finished'
		};

		expect(summarizeRun(empty)).toEqual({
			totalWorkMs: 0,
			periodsCompleted: 0,
			roundsReached: 0,
			overtimeMs: 0
		});
	});
});
