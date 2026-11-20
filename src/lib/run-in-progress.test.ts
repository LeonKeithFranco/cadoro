import { describe, expect, it } from 'vitest';
import type { Routine } from './routine';
import {
	followRunInProgress,
	isRevision,
	restoreRunInProgress,
	toStoredRunInProgress,
	withHeartbeat,
	type RestoredRun,
	type StartedRun
} from './run-in-progress';
import { createRun, finish, next, pause, play, type RunState } from './run';
import { minutes } from './testing/durations';
import { savedRunInProgress } from './testing/run-in-progress';
import { runInProgress } from './testing/run-records';
import { routineWith } from './testing/routines';

/** One 25-minute block at 20%, repeating forever, so Next always starts a 5-minute break. */
const foreverRoutine = routineWith({ rounds: 'infinite' });

/**
 * Turns a time of day on a synthetic day into the engine's milliseconds.
 *
 * @param time - The time in UTC, such as `09:30:00.250`.
 * @returns The moment, in milliseconds since 1970 (UTC).
 */
function at(time: string): number {
	return Date.parse(`2026-11-19T${time}Z`);
}

/**
 * Narrows a run from the engine to one Play has started, failing the test if it hasn't.
 *
 * @param run - The run, from the engine's buttons.
 * @returns The same run, typed as started.
 * @throws {@link Error} If the run is still ready, which means the test pressed no Play.
 */
function started(run: RunState): StartedRun {
	if (run.status === 'ready') {
		throw new Error('The test’s run should have started.');
	}
	return run;
}

/**
 * Saves a run of {@link foreverRoutine} as storage would, then restores it, as a reload does.
 *
 * @param run - The run, from the engine's buttons.
 * @param heartbeatAt - The moment of the last save, in milliseconds since 1970 (UTC).
 * @param routines - The saved routines to restore it among.
 * @returns What restoring gives.
 */
function saveAndRestore(
	run: RunState,
	heartbeatAt: number,
	routines: Routine[] = [foreverRoutine]
): RestoredRun | null {
	const stored = toStoredRunInProgress(runInProgress, started(run), heartbeatAt, 'revision-1');
	// A copy, as IndexedDB keeps, so nothing can come back by sharing objects with the run saved.
	return restoreRunInProgress(structuredClone(stored), routines);
}

describe('toStoredRunInProgress', () => {
	it('keeps every moment as a UTC timestamp, to the millisecond, and leaves the routine out', () => {
		const working = pause(play(createRun(foreverRoutine), at('09:00:00.000')), at('09:10:00.250'));
		const resumed = play(working, at('09:12:00.000'));

		expect(
			toStoredRunInProgress(runInProgress, started(resumed), at('09:15:30.500'), 'revision-1')
		).toEqual({
			record: runInProgress,
			run: {
				status: 'working',
				endedPeriods: [],
				position: { round: 0, block: 0, cycle: 0 },
				segments: [{ start: '2026-11-19T09:00:00.000Z', end: '2026-11-19T09:10:00.250Z' }],
				runningSince: '2026-11-19T09:12:00.000Z',
				bankedMs: 0
			},
			heartbeatAt: '2026-11-19T09:15:30.500Z',
			revision: 'revision-1'
		});
	});

	it('keeps a break’s earned and remaining time, and the work periods ended before it', () => {
		const onBreak = pause(
			next(play(createRun(foreverRoutine), at('09:00')), at('09:25')),
			at('09:26')
		);

		expect(
			toStoredRunInProgress(runInProgress, started(onBreak), at('09:26'), 'revision-1').run
		).toEqual({
			status: 'break',
			endedPeriods: [
				{
					position: { round: 0, block: 0, cycle: 0 },
					targetMinutes: 25,
					segments: [{ start: '2026-11-19T09:00:00.000Z', end: '2026-11-19T09:25:00.000Z' }],
					workedMs: minutes(25)
				}
			],
			position: { round: 0, block: 0, cycle: 0 },
			nextWorkPosition: { round: 1, block: 0, cycle: 0 },
			earnedMs: minutes(5),
			remainingMs: minutes(4),
			runningSince: null
		});
	});
});

describe('restoreRunInProgress', () => {
	it('gives back a paused work period exactly as it was saved', () => {
		const paused = pause(play(createRun(foreverRoutine), at('09:00:00.000')), at('09:10:00.250'));

		expect(saveAndRestore(paused, at('09:10:00.250'))?.run).toEqual(paused);
	});

	it('gives back a paused break exactly as it was saved', () => {
		const onBreak = next(play(createRun(foreverRoutine), at('09:00')), at('09:25'));
		const paused = pause(onBreak, at('09:26'));

		expect(saveAndRestore(paused, at('09:26'))?.run).toEqual(paused);
	});

	it('gives back an ended run, with its work periods, so its summary can show', () => {
		const ended = finish(play(createRun(foreverRoutine), at('09:00')), at('09:20'));

		expect(saveAndRestore(ended, at('09:20'))?.run).toEqual(ended);
	});

	it('pauses a running work period at the heartbeat, so time after it isn’t counted', () => {
		const working = play(createRun(foreverRoutine), at('09:00:00.000'));

		expect(saveAndRestore(working, at('09:10:00.250'))?.run).toEqual({
			status: 'working',
			plan: foreverRoutine,
			endedPeriods: [],
			position: { round: 0, block: 0, cycle: 0 },
			segments: [{ start: at('09:00:00.000'), end: at('09:10:00.250') }],
			runningSince: null,
			bankedMs: 0
		});
	});

	it('pauses a running break at the heartbeat, keeping the time it had left then', () => {
		const onBreak = next(play(createRun(foreverRoutine), at('09:00')), at('09:25'));

		const restored = saveAndRestore(onBreak, at('09:27'))?.run;

		expect(restored).toMatchObject({
			status: 'break',
			remainingMs: minutes(3),
			runningSince: null
		});
	});

	it('leaves a break that was over at the heartbeat as it was, so it still shows as over', () => {
		const onBreak = next(play(createRun(foreverRoutine), at('09:00')), at('09:25'));

		expect(saveAndRestore(onBreak, at('09:31'))?.run).toEqual(onBreak);
	});

	it('gives the run’s routine and its record as Play started it', () => {
		const otherRoutine = routineWith({ id: 'other' });
		const working = play(createRun(foreverRoutine), at('09:00'));

		const restored = saveAndRestore(working, at('09:05'), [otherRoutine, foreverRoutine]);

		expect(restored?.routine).toBe(foreverRoutine);
		expect(restored?.record).toEqual(runInProgress);
	});

	it('gives null when the run’s routine isn’t among the saved routines', () => {
		const working = play(createRun(foreverRoutine), at('09:00'));

		expect(saveAndRestore(working, at('09:05'), [routineWith({ id: 'other' })])).toBeNull();
	});
});

describe('followRunInProgress', () => {
	it('gives back a running work period still running, since the tab that saved it is open', () => {
		const working = play(createRun(foreverRoutine), at('09:00'));
		const stored = toStoredRunInProgress(
			runInProgress,
			started(working),
			at('09:05'),
			'revision-1'
		);

		const followed = followRunInProgress(structuredClone(stored), [foreverRoutine]);

		expect(followed).toEqual({ routine: foreverRoutine, record: runInProgress, run: working });
	});

	it('gives back a running break with the time it had left when it started counting', () => {
		const onBreak = next(play(createRun(foreverRoutine), at('09:00')), at('09:25'));
		const stored = toStoredRunInProgress(
			runInProgress,
			started(onBreak),
			at('09:27'),
			'revision-1'
		);

		expect(followRunInProgress(structuredClone(stored), [foreverRoutine])?.run).toEqual(onBreak);
	});

	it('gives null when the run’s routine isn’t among the routines', () => {
		const working = play(createRun(foreverRoutine), at('09:00'));
		const stored = toStoredRunInProgress(
			runInProgress,
			started(working),
			at('09:05'),
			'revision-1'
		);

		expect(followRunInProgress(stored, [routineWith({ id: 'other' })])).toBeNull();
	});
});

describe('isRevision', () => {
	it('says yes for the revision saved', () => {
		expect(isRevision(savedRunInProgress, 'revision-1')).toBe(true);
	});

	it('says no for another revision', () => {
		expect(isRevision(savedRunInProgress, 'revision-2')).toBe(false);
	});

	it('says no for a change worked out with none saved, once one is', () => {
		expect(isRevision(savedRunInProgress, null)).toBe(false);
	});

	it('says no for a revision once none is saved', () => {
		expect(isRevision(null, 'revision-1')).toBe(false);
	});

	it('says yes for a change worked out with none saved, while none is', () => {
		expect(isRevision(null, null)).toBe(true);
	});
});

describe('withHeartbeat', () => {
	it('moves the heartbeat on, keeping everything else', () => {
		expect(withHeartbeat(savedRunInProgress, 'revision-1', '2026-11-19T09:10:01.000Z')).toEqual({
			...savedRunInProgress,
			heartbeatAt: '2026-11-19T09:10:01.000Z'
		});
	});

	it('drops a heartbeat taken for another revision, as by a tab that hasn’t seen a press', () => {
		expect(withHeartbeat(savedRunInProgress, 'revision-2', '2026-11-19T09:10:01.000Z')).toBeNull();
	});

	it('drops a heartbeat when no run in progress is saved', () => {
		expect(withHeartbeat(null, 'revision-1', '2026-11-19T09:10:01.000Z')).toBeNull();
	});

	it('drops a heartbeat earlier than the one saved, so another tab’s late one can’t move it back', () => {
		expect(withHeartbeat(savedRunInProgress, 'revision-1', '2026-11-19T09:09:59.999Z')).toBeNull();
	});

	it('drops a heartbeat at the same moment as the one saved, since it adds nothing', () => {
		expect(withHeartbeat(savedRunInProgress, 'revision-1', '2026-11-19T09:10:00.000Z')).toBeNull();
	});
});

describe('the banked break in a stored run', () => {
	/**
	 * A work period that started after Next on a break with 3 of its 5 minutes left, so it carries
	 * a bank of 3 minutes, running since 09:27.
	 *
	 * @returns The run, in that work period.
	 */
	function workingWithBank(): RunState {
		const onBreak = next(play(createRun(foreverRoutine), at('09:00')), at('09:25'));
		return next(onBreak, at('09:27'));
	}

	it('keeps a work period’s bank when it is stored and read back', () => {
		const stored = toStoredRunInProgress(
			runInProgress,
			started(workingWithBank()),
			at('09:30'),
			'revision-1'
		);

		expect(stored.run).toMatchObject({ status: 'working', bankedMs: minutes(3) });
		expect(followRunInProgress(structuredClone(stored), [foreverRoutine])?.run).toMatchObject({
			bankedMs: minutes(3)
		});
	});

	it('keeps the bank in a run restored paused at the heartbeat', () => {
		const restored = saveAndRestore(workingWithBank(), at('09:30'))?.run;

		expect(restored).toMatchObject({
			status: 'working',
			runningSince: null,
			bankedMs: minutes(3)
		});
	});

	it('keeps the bank in a run followed live', () => {
		const working = workingWithBank();
		const stored = toStoredRunInProgress(
			runInProgress,
			started(working),
			at('09:30'),
			'revision-1'
		);

		expect(followRunInProgress(structuredClone(stored), [foreverRoutine])?.run).toEqual(working);
	});
});
