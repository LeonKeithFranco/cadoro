import { describe, expect, it } from 'vitest';
import { createRun, finish, next, play, viewRun, type RunState } from './run';
import { announcementFor } from './run-announcement';
import { minutes, seconds } from './testing/durations';
import { foreverRoutine } from './testing/routines';

/**
 * Works out what's announced for a run at a moment.
 *
 * @param run - The run.
 * @param now - The moment, in milliseconds since 1970.
 * @returns The announcement for the run's view then.
 */
function announcedAt(run: RunState, now: number): string {
	return announcementFor(viewRun(run, now));
}

describe('announcementFor', () => {
	it('says nothing before the run starts, or while work is under its target', () => {
		const ready = createRun(foreverRoutine);
		const working = play(ready, 0);

		expect(announcedAt(ready, 0)).toBe('');
		expect(announcedAt(working, minutes(25) - 1)).toBe('');
	});

	it('says Overtime once work reaches its target, and keeps saying it as it grows', () => {
		const working = play(createRun(foreverRoutine), 0);

		expect(announcedAt(working, minutes(25))).toBe('Overtime');
		expect(announcedAt(working, minutes(40))).toBe('Overtime');
	});

	it('says Break started while the break counts down, and Break over once it reaches 0:00', () => {
		const onBreak = next(play(createRun(foreverRoutine), 0), minutes(25));

		expect(announcedAt(onBreak, minutes(25))).toBe('Break started');
		expect(announcedAt(onBreak, minutes(25) + minutes(5) - seconds(1))).toBe('Break started');
		expect(announcedAt(onBreak, minutes(25) + minutes(5))).toBe('Break over');
	});

	it('says Run ended once the run ends', () => {
		const ended = finish(play(createRun(foreverRoutine), 0), minutes(10));

		expect(announcedAt(ended, minutes(10))).toBe('Run ended');
	});
});
