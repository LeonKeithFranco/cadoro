import { describe, expect, it } from 'vitest';
import { nextChime } from './chime-schedule';
import { createRun, finish, next, pause, play, type RoutinePlan, type RunState } from './run';
import { minutes, seconds } from './testing/durations';
import { oneRoundRoutine, routineWith } from './testing/routines';

/** The moment every run in these tests starts, an arbitrary one in milliseconds since 1970. */
const start = Date.UTC(2026, 10, 19, 9, 0, 0);

/** A routine that repeats one 25-minute block at 20% forever, so its breaks are a fifth of the work. */
const infinitePlan: RoutinePlan = routineWith({ rounds: 'infinite' });

/**
 * Starts a run of a routine with Play at {@link start}.
 *
 * @param plan - The routine to run.
 * @returns The run in its first work period, running since {@link start}.
 */
function startedRun(plan: RoutinePlan): RunState {
	return play(createRun(plan), start);
}

/**
 * Starts a run, works its first work period for 25 minutes, then presses Next, which starts a
 * 5-minute break.
 *
 * @returns The run on its break, running since 25 minutes after {@link start}.
 */
function runOnBreak(): RunState {
	return next(startedRun(infinitePlan), start + minutes(25));
}

describe('nextChime', () => {
	describe('during a work period', () => {
		it('is due when the work reaches its target', () => {
			const run = startedRun(infinitePlan);

			expect(nextChime(run, start)).toEqual({ alert: 'target', at: start + minutes(25) });
		});

		it('gives the same moment whenever it is asked before the target', () => {
			const run = startedRun(infinitePlan);
			const expected = { alert: 'target', at: start + minutes(25) };

			for (let second = 0; second < 25 * 60; second++) {
				expect(nextChime(run, start + seconds(second))).toEqual(expected);
			}
		});

		it('is still due a millisecond before the target', () => {
			const run = startedRun(infinitePlan);

			expect(nextChime(run, start + minutes(25) - 1)).toEqual({
				alert: 'target',
				at: start + minutes(25)
			});
		});

		it('is not due once the target is reached', () => {
			const run = startedRun(infinitePlan);

			expect(nextChime(run, start + minutes(25))).toBeNull();
		});

		it('is not due in overtime', () => {
			const run = startedRun(infinitePlan);

			expect(nextChime(run, start + minutes(40))).toBeNull();
		});

		it('is not due while paused', () => {
			const run = pause(startedRun(infinitePlan), start + minutes(10));

			expect(nextChime(run, start + minutes(10))).toBeNull();
		});

		it('moves later by the time spent paused', () => {
			const paused = pause(startedRun(infinitePlan), start + minutes(10));
			const resumed = play(paused, start + minutes(15));

			expect(nextChime(resumed, start + minutes(15))).toEqual({
				alert: 'target',
				at: start + minutes(30)
			});
		});

		it('adds up every stretch worked before the current one', () => {
			let run = startedRun(infinitePlan);
			run = pause(run, start + minutes(5));
			run = play(run, start + minutes(10));
			run = pause(run, start + minutes(20));
			run = play(run, start + minutes(30));

			// 5 + 10 minutes are worked, so 10 are left from the last Play.
			expect(nextChime(run, start + minutes(30))).toEqual({
				alert: 'target',
				at: start + minutes(40)
			});
		});

		it('is not due again when work paused in overtime resumes', () => {
			const paused = pause(startedRun(infinitePlan), start + minutes(30));
			const resumed = play(paused, start + minutes(35));

			expect(nextChime(resumed, start + minutes(35))).toBeNull();
		});

		it('uses the current block’s target', () => {
			const plan: RoutinePlan = {
				rounds: 1,
				blocks: [
					{ id: 'short', title: 'Short', targetMinutes: 25, breakPercent: 20, cycles: 1 },
					{ id: 'long', title: 'Long', targetMinutes: 50, breakPercent: 20, cycles: 1 }
				]
			};
			const onBreak = next(startedRun(plan), start + minutes(25));
			const secondBlock = next(onBreak, start + minutes(26));

			expect(nextChime(secondBlock, start + minutes(26))).toEqual({
				alert: 'target',
				at: start + minutes(76)
			});
		});

		it('keeps the target’s moment when the device’s clock moves back', () => {
			const run = startedRun(infinitePlan);

			expect(nextChime(run, start - minutes(1))).toEqual({
				alert: 'target',
				at: start + minutes(25)
			});
		});
	});

	describe('during a break', () => {
		it('is due when the break reaches 0:00', () => {
			const run = runOnBreak();

			expect(nextChime(run, start + minutes(25))).toEqual({
				alert: 'break',
				at: start + minutes(30)
			});
		});

		it('gives the same moment whenever it is asked before the break ends', () => {
			const run = runOnBreak();
			const expected = { alert: 'break', at: start + minutes(30) };

			for (let second = 0; second < 5 * 60; second++) {
				expect(nextChime(run, start + minutes(25) + seconds(second))).toEqual(expected);
			}
		});

		it('is not due once the break is over', () => {
			const run = runOnBreak();

			expect(nextChime(run, start + minutes(30))).toBeNull();
		});

		it('is not due while the break is paused', () => {
			const run = pause(runOnBreak(), start + minutes(27));

			expect(nextChime(run, start + minutes(27))).toBeNull();
		});

		it('moves later by the time the break spent paused', () => {
			const paused = pause(runOnBreak(), start + minutes(27));
			const resumed = play(paused, start + minutes(40));

			expect(nextChime(resumed, start + minutes(40))).toEqual({
				alert: 'break',
				at: start + minutes(43)
			});
		});

		it('is not due for a break that earned no time', () => {
			// Two seconds at 20% earns 0.4 seconds, which rounds to a break of 0.
			const run = next(startedRun(infinitePlan), start + seconds(2));

			expect(nextChime(run, start + seconds(2))).toBeNull();
		});

		it('is due at the end of a break that includes a bank', () => {
			// Next after 2 of 5 break minutes banks 3, and 10 minutes of work at 20% earns 2 more.
			const banked = next(runOnBreak(), start + minutes(27));
			const run = next(banked, start + minutes(37));

			expect(nextChime(run, start + minutes(37))).toEqual({
				alert: 'break',
				at: start + minutes(42)
			});
		});

		it('is due for a break that earned no time but has a bank', () => {
			const banked = next(runOnBreak(), start + minutes(27));
			const workedFor = start + minutes(27) + seconds(2);
			const run = next(banked, workedFor);

			expect(nextChime(run, workedFor)).toEqual({
				alert: 'break',
				at: workedFor + minutes(3)
			});
		});
	});

	describe('before and after a run', () => {
		it('is not due before Play', () => {
			expect(nextChime(createRun(infinitePlan), start)).toBeNull();
		});

		it('is not due once Finish ends the run', () => {
			const run = finish(startedRun(infinitePlan), start + minutes(10));

			expect(nextChime(run, start + minutes(10))).toBeNull();
		});

		it('is not due once a finite routine’s last work period ends', () => {
			const run = next(startedRun(oneRoundRoutine), start + minutes(10));

			expect(nextChime(run, start + minutes(10))).toBeNull();
		});
	});

	describe('in an infinite routine', () => {
		it('is due at each later work period’s own target', () => {
			let run = startedRun(infinitePlan);
			let periodStart = start;
			for (let round = 0; round < 5; round++) {
				run = next(run, periodStart + minutes(25));
				periodStart += minutes(30);
				run = next(run, periodStart);
			}

			expect(nextChime(run, periodStart)).toEqual({
				alert: 'target',
				at: periodStart + minutes(25)
			});
		});
	});
});
