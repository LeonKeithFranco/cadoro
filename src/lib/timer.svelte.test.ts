import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useErrorLog } from './error-log';
import type { Routine } from './routine';
import type { StoredRunInProgress } from './run-in-progress';
import type { RunRecords } from './run-records';
import { InMemoryStorage } from './storage/in-memory-storage';
import type { CadoroStorage } from './storage/storage';
import { minutes, seconds } from './testing/durations';
import { recordedErrors } from './testing/error-log';
import { numberedIds } from './testing/ids';
import {
	classic,
	classicWithLongBreak,
	foreverRoutine,
	oneRoundRoutine,
	routineWith,
	starterRoutines as routines
} from './testing/routines';
import { storageHolding } from './testing/storage';
import { restartRevisions, testSessionOptions } from './testing/timer-session';
import { TimerSession, type AppOpening, type TimerSessionOptions } from './timer.svelte';

/**
 * Orders routines by title, Z to A, as a picker sorted that way does.
 *
 * @param choices - The routines in any order.
 * @returns A new list, the last title in the alphabet first.
 */
function byTitleDescending(choices: readonly Routine[]): Routine[] {
	return choices.toSorted((a, b) => b.title.localeCompare(a.title));
}

/**
 * Makes storage holding every routine these tests start a run of, which storage requires of a
 * new run, for the tests that share one storage between sessions.
 *
 * @returns New storage holding the starter routines, the one-round routine and the forever one.
 */
function storageForRuns(): InMemoryStorage {
	return storageHolding([...routines, oneRoundRoutine, foreverRoutine]);
}

/** The fake clock's current moment, in milliseconds since 1970, which each test moves by hand. */
let nowMs = 0;

/**
 * Starts a session on the fake clock, with ids numbered from `id-1` and revisions from
 * `revision-1`.
 *
 * @param choices - The routines to pick from. The starter routines unless a test needs others.
 * @param options - The options a test sets, `storage`, `newId`, `onWorkSaved` and `onPress`.
 * Unless given, the session saves to new, empty storage, `onWorkSaved` is a spy nothing checks,
 * and there's no `onPress`. Two tabs share a storage, each with ids of its own.
 * @param opening - What the app found as it opened. No saved run and no other tab open, unless
 * given.
 * @returns A new session, carrying on the saved run, or with the first routine chosen and its run
 * ready.
 */
function createSession(
	choices: readonly Routine[] = routines,
	options: Partial<
		Pick<
			TimerSessionOptions,
			| 'storage'
			| 'newId'
			| 'onWorkSaved'
			| 'onRunSaved'
			| 'onPress'
			| 'onRunStarted'
			| 'pickerOrder'
		>
	> = {},
	opening: Partial<AppOpening> = {}
): TimerSession {
	return new TimerSession(
		choices,
		testSessionOptions(() => nowMs, options.storage ?? storageHolding(choices), options),
		{ saved: null, isAnotherTabOpen: false, ...opening }
	);
}

// Starts each test at the fake clock's 0, with revisions numbered from `revision-1` again.
beforeEach(() => {
	nowMs = 0;
	restartRevisions();
});

describe('TimerSession', () => {
	it('lists the routines to pick from in their order', () => {
		const session = createSession();

		const titles = session.routines.map((routine) => routine.title);
		expect(titles).toEqual(['Classic', 'Classic with long break']);
	});

	it('starts with the first routine chosen and its run ready', () => {
		const session = createSession();

		expect(session.routine).toBe(classic);
		expect(session.view).toEqual({
			status: 'ready',
			block: 0,
			cycle: 0,
			label: 'Round 1',
			isRunning: false,
			isInProgress: false
		});
	});

	it('refuses to start without a routine to pick', () => {
		expect(() => createSession([])).toThrow('A timer session needs at least one routine.');
	});
});

describe('opening on the last routine used', () => {
	it.each([
		{
			opening: 'the last run used the second routine',
			options: {},
			opened: { lastRoutineId: classicWithLongBreak.id },
			chosen: classicWithLongBreak
		},
		{
			opening: 'the last routine is gone',
			options: {},
			opened: { lastRoutineId: 'a-deleted-routine' },
			chosen: classic
		},
		{
			opening: 'no run has started yet',
			options: {},
			opened: { lastRoutineId: null },
			chosen: classic
		},
		{
			opening: 'there is no last routine and the picker sorts by title descending',
			options: { pickerOrder: byTitleDescending },
			opened: {},
			chosen: classicWithLongBreak
		},
		{
			opening: 'the last routine is gone and the picker sorts by title descending',
			options: { pickerOrder: byTitleDescending },
			opened: { lastRoutineId: 'a-deleted-routine' },
			chosen: classicWithLongBreak
		}
	])('chooses $chosen.title, ready to run, when $opening', ({ options, opened, chosen }) => {
		const session = createSession(routines, options, opened);

		expect(session.routine).toBe(chosen);
		expect(session.view.status).toBe('ready');
	});
});

describe('telling when a run starts', () => {
	it('reports the routine when Play starts the run, once', () => {
		const onRunStarted = vi.fn();
		const session = createSession(routines, { onRunStarted });
		session.select(classicWithLongBreak.id);

		session.play();
		session.pause();
		session.play();

		expect(onRunStarted).toHaveBeenCalledExactlyOnceWith(classicWithLongBreak.id);
	});

	it('reports nothing for a press that starts no run', () => {
		const onRunStarted = vi.fn();
		const session = createSession(routines, { onRunStarted });

		session.pause();
		session.next();
		session.finish();

		expect(onRunStarted).not.toHaveBeenCalled();
	});

	it('reports again when a new run is started after one ended', () => {
		const onRunStarted = vi.fn();
		const session = createSession(routines, { onRunStarted });
		session.play();
		session.finish();
		session.readyNewRun();
		session.select(classicWithLongBreak.id);

		session.play();

		expect(onRunStarted).toHaveBeenCalledTimes(2);
		expect(onRunStarted).toHaveBeenLastCalledWith(classicWithLongBreak.id);
	});
});

describe('choosing a routine', () => {
	it('chooses the routine and readies its run', () => {
		const session = createSession();

		session.select(classicWithLongBreak.id);

		expect(session.routine).toBe(classicWithLongBreak);
		expect(session.view).toMatchObject({
			status: 'ready',
			label: 'Round 1 · Block 1 of 2 · Cycle 1 of 3'
		});
	});

	it('changes nothing for an id that matches no routine', () => {
		const session = createSession();

		session.select('no-such-routine');

		expect(session.routine).toBe(classic);
		expect(session.view).toMatchObject({ status: 'ready', label: 'Round 1' });
	});

	it('keeps the routine and its run while the run is in progress', () => {
		const session = createSession();
		session.play();
		nowMs = seconds(10);

		session.select(classicWithLongBreak.id);
		session.tick();

		expect(session.routine).toBe(classic);
		expect(session.view).toMatchObject({ status: 'working', workedMs: seconds(10) });
	});

	it('keeps the routine while the run is paused', () => {
		const session = createSession();
		session.play();
		session.pause();

		session.select(classicWithLongBreak.id);

		expect(session.routine).toBe(classic);
	});

	it('can choose another routine once the run is finished', () => {
		const session = createSession();
		session.play();
		session.finish();

		session.select(classicWithLongBreak.id);

		expect(session.routine).toBe(classicWithLongBreak);
	});
});

describe('the routine a run holds', () => {
	it('is none while the run is ready', () => {
		const session = createSession();

		expect(session.heldRoutineId).toBeNull();
	});

	it('is the routine while the run works, is paused or is on a break', () => {
		const session = createSession();
		session.play();
		expect(session.heldRoutineId).toBe(classic.id);

		session.pause();
		expect(session.heldRoutineId).toBe(classic.id);

		session.play();
		session.next();
		expect(session.view.status).toBe('break');
		expect(session.heldRoutineId).toBe(classic.id);
	});

	it('is still the routine once the run has ended, until its summary is closed', () => {
		const session = createSession();
		session.play();
		session.finish();
		expect(session.view.status).toBe('ended');

		expect(session.heldRoutineId).toBe(classic.id);

		session.readyNewRun();
		expect(session.heldRoutineId).toBeNull();
	});
});

describe('the controls', () => {
	it('starts the work period from the moment Play is pressed', () => {
		const session = createSession();
		nowMs = seconds(3);

		session.play();
		nowMs = seconds(3) + minutes(1);
		session.tick();

		expect(session.view).toMatchObject({
			status: 'working',
			workedMs: minutes(1),
			isRunning: true,
			isInProgress: true
		});
	});

	it('moves the view on to the clock only when ticked', () => {
		const session = createSession();
		session.play();
		nowMs = seconds(5);

		expect(session.view).toMatchObject({ workedMs: 0 });
		session.tick();
		expect(session.view).toMatchObject({ workedMs: seconds(5) });
	});

	it('pauses at the moment Pause is pressed, without waiting for a tick', () => {
		const session = createSession();
		session.play();
		nowMs = seconds(30);

		session.pause();

		expect(session.view).toMatchObject({ workedMs: seconds(30), isRunning: false });
	});

	it("shows each button's change even when the clock hasn't moved", () => {
		const session = createSession();

		session.play();
		expect(session.view).toMatchObject({ status: 'working', isRunning: true });
		session.pause();
		expect(session.view).toMatchObject({ status: 'working', isRunning: false });
	});

	it("doesn't count paused time as work", () => {
		const session = createSession();
		session.play();
		nowMs = seconds(30);
		session.pause();

		nowMs = minutes(5);
		session.tick();

		expect(session.view).toMatchObject({ workedMs: seconds(30), isRunning: false });
	});

	it('resumes a paused work period with Play', () => {
		const session = createSession();
		session.play();
		nowMs = seconds(30);
		session.pause();
		nowMs = minutes(5);

		session.play();
		nowMs = minutes(5) + seconds(10);
		session.tick();

		expect(session.view).toMatchObject({ workedMs: seconds(40), isRunning: true });
	});

	it('starts the earned break with Next, from the moment it is pressed', () => {
		const session = createSession();
		session.play();
		nowMs = minutes(25);

		session.next();

		expect(session.view).toMatchObject({
			status: 'break',
			workedMs: minutes(25),
			earnedMs: minutes(5),
			remainingMs: minutes(5),
			isRunning: true
		});
	});

	it('ends a break early with Next and starts the next work period', () => {
		const session = createSession();
		session.play();
		nowMs = minutes(25);
		session.next();
		nowMs = minutes(26);

		session.next();
		nowMs = minutes(27);
		session.tick();

		expect(session.view).toMatchObject({
			status: 'working',
			label: 'Round 2',
			workedMs: minutes(1)
		});
	});

	it('ends the run with Finish and keeps it, with its summary', () => {
		const session = createSession();
		session.select(classicWithLongBreak.id);
		session.play();
		nowMs = minutes(25);
		session.next();
		nowMs = minutes(27);
		session.next();
		nowMs = minutes(30);

		session.finish();

		expect(session.routine).toBe(classicWithLongBreak);
		expect(session.view).toEqual({
			status: 'ended',
			summary: {
				totalWorkMs: minutes(28),
				periodsCompleted: 2,
				roundsReached: 1,
				overtimeMs: 0
			},
			isRunning: false,
			isInProgress: false
		});
	});

	it('ends a finite routine with its last Next, keeping the run and its summary', () => {
		const session = createSession([oneRoundRoutine]);
		session.play();
		nowMs = minutes(26);

		session.next();

		expect(session.view).toEqual({
			status: 'ended',
			summary: {
				totalWorkMs: minutes(26),
				periodsCompleted: 1,
				roundsReached: 1,
				overtimeMs: minutes(1)
			},
			isRunning: false,
			isInProgress: false
		});
	});

	it('leaves a ready run as it is on Pause, Next and Finish', () => {
		const session = createSession();

		session.pause();
		session.next();
		session.finish();

		expect(session.view).toMatchObject({ status: 'ready', isInProgress: false });
	});
});

describe('the run as the chimes see it', () => {
	it('gives the run as each press leaves it, and keeps the same run through ticks', () => {
		const session = createSession();
		expect(session.run).toMatchObject({ status: 'ready' });

		nowMs = seconds(5);
		session.play();
		const started = session.run;
		nowMs = seconds(30);
		session.tick();

		expect(started).toMatchObject({ status: 'working', runningSince: seconds(5) });
		expect(session.run).toBe(started);
	});

	it('gives the run another tab changed, once the session takes it on', async () => {
		const storage = storageForRuns();
		const firstTab = createSession([foreverRoutine], { storage, newId: numberedIds('first') });
		const secondTab = createSession([foreverRoutine], { storage, newId: numberedIds('second') });

		firstTab.play();

		await expect.poll(() => secondTab.run).toMatchObject({ status: 'working', runningSince: 0 });
	});

	it('calls onPress as each button is pressed, before the press changes the run', () => {
		const statusesWhenCalled: string[] = [];
		const session = createSession([foreverRoutine], {
			onPress: () => statusesWhenCalled.push(session.run.status)
		});

		session.play();
		session.next();
		session.pause();
		session.finish();

		expect(statusesWhenCalled).toEqual(['ready', 'working', 'break', 'break']);
	});

	it('calls onPress even for a press that changes nothing, such as Pause on a ready run', () => {
		const onPress = vi.fn();
		const session = createSession(routines, { onPress });

		session.pause();

		expect(onPress).toHaveBeenCalledOnce();
	});

	it('pauses on leaving the screen, saving the pause, without calling onPress', async () => {
		const onPress = vi.fn();
		const storage = storageForRuns();
		const session = createSession(routines, { onPress, storage });
		session.play();
		onPress.mockClear();

		nowMs = minutes(4);
		session.pauseOnLeave();

		expect(session.view).toMatchObject({ isRunning: false, workedMs: minutes(4) });
		expect(onPress).not.toHaveBeenCalled();
		await expect
			.poll(async () => (await storage.getRunInProgress())?.run)
			.toMatchObject({ runningSince: null });
	});

	it('calls onPress for no tick, choice or new run', () => {
		const onPress = vi.fn();
		const session = createSession(routines, { onPress });

		session.select(classicWithLongBreak.id);
		session.tick();
		session.readyNewRun();

		expect(onPress).not.toHaveBeenCalled();
	});
});

describe('readying a new run', () => {
	it('readies a new run of the same routine once the run has ended', () => {
		const session = createSession();
		session.select(classicWithLongBreak.id);
		session.play();
		nowMs = minutes(10);
		session.finish();

		session.readyNewRun();

		expect(session.routine).toBe(classicWithLongBreak);
		expect(session.view).toEqual({
			status: 'ready',
			block: 0,
			cycle: 0,
			label: 'Round 1 · Block 1 of 2 · Cycle 1 of 3',
			isRunning: false,
			isInProgress: false
		});
	});

	it('leaves a run in progress as it is', () => {
		const session = createSession();
		session.play();
		nowMs = minutes(10);

		session.readyNewRun();
		session.tick();

		expect(session.view).toMatchObject({
			status: 'working',
			workedMs: minutes(10),
			isRunning: true
		});
	});

	it('leaves a paused run as it is', () => {
		const session = createSession();
		session.play();
		nowMs = minutes(10);
		session.pause();

		session.readyNewRun();

		expect(session.view).toMatchObject({
			status: 'working',
			workedMs: minutes(10),
			isInProgress: true
		});
	});
});

describe('recording runs', () => {
	// Takes away the log a test chose for errors, and puts back what each test spied on.
	afterEach(() => {
		useErrorLog(null);
		vi.restoreAllMocks();
	});

	it('saves a whole run: its start, each work period and how it ended', async () => {
		const storage = storageForRuns();
		const session = createSession([foreverRoutine], { storage });
		session.play();
		nowMs = minutes(10);
		session.pause();
		nowMs = minutes(15);
		session.play();
		nowMs = minutes(30);
		session.next();
		nowMs = minutes(36);
		session.play();
		nowMs = minutes(40);

		session.finish();

		await expect
			.poll(() => storage.getRuns())
			.toEqual([
				{
					id: 'id-1',
					routineId: 'forever',
					startedAt: '1970-01-01T00:00:00.000Z',
					endedAt: '1970-01-01T00:40:00.000Z',
					outcome: 'finished',
					roundsReached: 2
				}
			]);
		expect(await storage.getWorkPeriods()).toEqual([
			{
				id: 'id-2',
				runId: 'id-1',
				routineId: 'forever',
				blockId: 'one-round-focus',
				targetMinutes: 25,
				segments: [
					{ start: '1970-01-01T00:00:00.000Z', end: '1970-01-01T00:10:00.000Z' },
					{ start: '1970-01-01T00:15:00.000Z', end: '1970-01-01T00:30:00.000Z' }
				],
				workedMs: minutes(25)
			},
			{
				id: 'id-3',
				runId: 'id-1',
				routineId: 'forever',
				blockId: 'one-round-focus',
				targetMinutes: 25,
				segments: [{ start: '1970-01-01T00:36:00.000Z', end: '1970-01-01T00:40:00.000Z' }],
				workedMs: minutes(4)
			}
		]);
	});

	it('saves nothing before Play, whatever routine is chosen or button pressed', async () => {
		const storage = storageForRuns();
		const session = createSession([oneRoundRoutine, foreverRoutine], { storage });
		session.select('forever');
		session.pause();
		session.next();
		session.finish();
		nowMs = minutes(5);

		session.play();

		// Saves reach storage in order, so once Play's run is saved, any earlier save would be too.
		await expect
			.poll(() => storage.getRuns())
			.toEqual([
				expect.objectContaining({ routineId: 'forever', startedAt: '1970-01-01T00:05:00.000Z' })
			]);
		expect(await storage.getWorkPeriods()).toEqual([]);
	});

	it('gives the next run after Done a record of its own', async () => {
		const storage = storageForRuns();
		const session = createSession([oneRoundRoutine], { storage });
		session.play();
		nowMs = minutes(26);
		session.next();
		session.readyNewRun();
		nowMs = minutes(30);

		session.play();

		await expect
			.poll(() => storage.getRuns())
			.toEqual([
				expect.objectContaining({ id: 'id-1', outcome: 'completed' }),
				expect.objectContaining({
					id: 'id-3',
					startedAt: '1970-01-01T00:30:00.000Z',
					outcome: null
				})
			]);
	});

	it('saves the run in progress with each press, as of the moment it was pressed', async () => {
		const storage = storageForRuns();
		const session = createSession([foreverRoutine], { storage });
		session.play();
		nowMs = minutes(10);

		session.pause();

		await expect
			.poll(() => storage.getRunInProgress())
			.toEqual({
				record: {
					id: 'id-1',
					routineId: 'forever',
					startedAt: '1970-01-01T00:00:00.000Z',
					endedAt: null,
					outcome: null,
					roundsReached: 0
				},
				run: {
					status: 'working',
					endedPeriods: [],
					position: { round: 0, block: 0, cycle: 0 },
					segments: [{ start: '1970-01-01T00:00:00.000Z', end: '1970-01-01T00:10:00.000Z' }],
					runningSince: null,
					bankedMs: 0
				},
				heartbeatAt: '1970-01-01T00:10:00.000Z',
				revision: 'revision-2'
			});
	});

	it('saves the ended run as the run in progress, so its summary can come back', async () => {
		const storage = storageForRuns();
		const session = createSession([foreverRoutine], { storage });
		session.play();
		nowMs = minutes(25);

		session.finish();

		await expect
			.poll(() => storage.getRunInProgress())
			.toMatchObject({
				record: { id: 'id-1', outcome: 'finished' },
				run: { status: 'ended', outcome: 'finished' }
			});
	});

	it('saves nothing for a press that changes nothing, such as Pause on a paused run', async () => {
		const storage = storageForRuns();
		const saveSpy = vi.spyOn(storage, 'saveRunInProgress');
		const session = createSession([foreverRoutine], { storage });
		session.play();
		nowMs = minutes(10);
		session.pause();
		nowMs = minutes(11);
		session.pause();
		nowMs = minutes(12);

		session.play();

		// Saves reach storage in order, so once Play's is saved, the second Pause's would be too.
		await expect
			.poll(() => storage.getRunInProgress())
			.toMatchObject({ run: { runningSince: '1970-01-01T00:12:00.000Z' } });
		expect(saveSpy).toHaveBeenCalledTimes(3);
	});

	it('saves each press in order, even when an earlier save is slow', async () => {
		const storage = storageForRuns();
		const save = storage.saveRunInProgress.bind(storage);
		const { promise: firstSaveHeld, resolve: releaseFirstSave } = Promise.withResolvers<void>();
		const saveSpy = vi
			.spyOn(storage, 'saveRunInProgress')
			.mockImplementationOnce(
				async (
					runInProgress: StoredRunInProgress,
					basedOn: string | null,
					records?: RunRecords
				): Promise<boolean> => {
					await firstSaveHeld;
					return save(runInProgress, basedOn, records);
				}
			);
		const session = createSession([oneRoundRoutine], { storage });
		session.play();
		nowMs = minutes(26);
		session.next();

		releaseFirstSave();
		await vi.waitFor(() => {
			expect(saveSpy).toHaveBeenCalledTimes(2);
		});
		await Promise.all(saveSpy.mock.results.map((result): unknown => result.value));

		expect(await storage.getRuns()).toEqual([
			expect.objectContaining({ id: 'id-1', outcome: 'completed' })
		]);
	});

	it('records a save that fails in the log, and carries on timing and saving', async () => {
		const storage = storageForRuns();
		useErrorLog(storage);
		vi.spyOn(storage, 'saveRunInProgress').mockRejectedValueOnce(new Error('The disk is full.'));
		const session = createSession([foreverRoutine], { storage });
		session.play();
		nowMs = minutes(25);

		session.next();

		expect(session.view).toMatchObject({ status: 'break', earnedMs: minutes(5) });
		await expect.poll(() => storage.getWorkPeriods()).toHaveLength(1);
		await expect
			.poll(() => recordedErrors(storage))
			.toEqual([['The run could not be saved.', 'The disk is full.']]);
	});

	it('says work is saved once each work period is, and not for the run alone', async () => {
		const storage = storageForRuns();
		const onWorkSaved = vi.fn();
		const session = createSession([foreverRoutine], { storage, onWorkSaved });
		session.play();
		await expect.poll(() => storage.getRuns()).toHaveLength(1);
		expect(onWorkSaved).not.toHaveBeenCalled();
		nowMs = minutes(25);

		session.next();

		await expect.poll(() => onWorkSaved).toHaveBeenCalledOnce();
		expect(await storage.getWorkPeriods()).toHaveLength(1);
	});

	it('says a run is saved only once it has reached storage, and not for a pause', async () => {
		const storage = storageForRuns();
		const runsInStorage: number[] = [];
		const onRunSaved = vi.fn(() => {
			void storage.getRuns().then((runs) => runsInStorage.push(runs.length));
		});
		const session = createSession([foreverRoutine], { storage, onRunSaved });

		session.play();

		await expect.poll(() => runsInStorage).toEqual([1]);
		session.pause();
		await expect.poll(() => storage.getRunInProgress()).not.toBeNull();
		expect(onRunSaved).toHaveBeenCalledOnce();
	});

	it('says nothing about work whose save failed', async () => {
		const storage = storageForRuns();
		const saveSpy = vi.spyOn(storage, 'saveRunInProgress');
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const onWorkSaved = vi.fn();
		const session = createSession([foreverRoutine], { storage, onWorkSaved });
		session.play();
		await expect.poll(() => storage.getRuns()).toHaveLength(1);
		saveSpy.mockRejectedValueOnce(new Error('The disk is full.'));
		nowMs = minutes(25);
		session.next();

		session.finish();

		// Finish's save waits for the failed one, so once the run shows as finished, the failed
		// save has been dealt with.
		await expect
			.poll(() => storage.getRuns())
			.toEqual([expect.objectContaining({ outcome: 'finished' })]);
		expect(await storage.getWorkPeriods()).toEqual([]);
		expect(onWorkSaved).not.toHaveBeenCalled();
	});
});

/**
 * Waits for a session's saves to reach storage, then reads the run in progress, as the app does
 * when it opens again after a reload, or after the phone stopped it.
 *
 * @param storage - The storage the session saved to.
 * @param heartbeatAt - The heartbeat of the session's last save, as a UTC timestamp. Saves reach
 * storage in order, so once it's saved, every earlier save is too.
 * @returns The run in progress as last saved.
 */
async function reopen(
	storage: InMemoryStorage,
	heartbeatAt: string
): Promise<StoredRunInProgress | null> {
	await expect.poll(() => storage.getRunInProgress()).toMatchObject({ heartbeatAt });
	return storage.getRunInProgress();
}

describe('keeping the run in progress', () => {
	// Puts back what each test spied on, such as storage's methods.
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('saves a heartbeat on each tick while a timer is counting', async () => {
		const storage = storageForRuns();
		const session = createSession([foreverRoutine], { storage });
		session.play();
		nowMs = seconds(1);

		session.tick();

		await expect
			.poll(() => storage.getRunInProgress())
			.toMatchObject({
				run: { status: 'working', runningSince: '1970-01-01T00:00:00.000Z' },
				heartbeatAt: '1970-01-01T00:00:01.000Z'
			});
	});

	it('saves no heartbeat while the run is paused, since nothing new happens', async () => {
		const storage = storageForRuns();
		const saveSpy = vi.spyOn(storage, 'saveRunInProgress');
		const heartbeatSpy = vi.spyOn(storage, 'saveHeartbeat');
		const session = createSession([foreverRoutine], { storage });
		session.play();
		nowMs = minutes(10);
		session.pause();
		nowMs = minutes(11);
		session.tick();
		nowMs = minutes(12);

		session.play();

		await reopen(storage, '1970-01-01T00:12:00.000Z');
		expect(saveSpy).toHaveBeenCalledTimes(3);
		expect(heartbeatSpy).not.toHaveBeenCalled();
	});

	it('forgets the run in progress once Done readies a new run, and keeps its records', async () => {
		const storage = storageForRuns();
		const session = createSession([foreverRoutine], { storage });
		session.play();
		nowMs = minutes(25);
		session.finish();

		session.readyNewRun();

		await expect.poll(() => storage.getRunInProgress()).toBeNull();
		expect(await storage.getRuns()).toEqual([expect.objectContaining({ outcome: 'finished' })]);
		expect(await storage.getWorkPeriods()).toHaveLength(1);
	});

	it('never brings back a run that Done forgot, even when a heartbeat’s save is slow', async () => {
		const storage = storageForRuns();
		const session = createSession([foreverRoutine], { storage });
		session.play();
		await reopen(storage, '1970-01-01T00:00:00.000Z');
		const saveHeartbeat = storage.saveHeartbeat.bind(storage);
		const { promise: heartbeatHeld, resolve: releaseHeartbeat } = Promise.withResolvers<void>();
		const heartbeatSpy = vi
			.spyOn(storage, 'saveHeartbeat')
			.mockImplementationOnce(async (revision: string, heartbeatAt: string): Promise<boolean> => {
				await heartbeatHeld;
				return saveHeartbeat(revision, heartbeatAt);
			});
		const saveSpy = vi.spyOn(storage, 'saveRunInProgress');
		const clearSpy = vi.spyOn(storage, 'clearRunInProgress');
		nowMs = seconds(1);
		session.tick();
		nowMs = minutes(25);
		session.finish();
		session.readyNewRun();

		releaseHeartbeat();
		await vi.waitFor(() => {
			expect(clearSpy).toHaveBeenCalledOnce();
		});
		await Promise.all(
			[...heartbeatSpy.mock.results, ...saveSpy.mock.results, ...clearSpy.mock.results].map(
				(result): unknown => result.value
			)
		);

		expect(await storage.getRunInProgress()).toBeNull();
	});

	it('carries on a saved run with its routine chosen, paused at its last heartbeat', async () => {
		const storage = storageForRuns();
		const first = createSession([classic, foreverRoutine], { storage });
		first.select('forever');
		first.play();
		nowMs = minutes(10);
		first.tick();
		const saved = await reopen(storage, '1970-01-01T00:10:00.000Z');
		nowMs = minutes(30);

		const reopened = createSession([classic, foreverRoutine], { storage }, { saved });

		expect(reopened.routine).toBe(foreverRoutine);
		expect(reopened.view).toMatchObject({
			status: 'working',
			workedMs: minutes(10),
			isRunning: false,
			isInProgress: true
		});
	});

	it('saves the restored run as paused, so storage shows what the screen does', async () => {
		const storage = storageForRuns();
		const first = createSession([foreverRoutine], { storage });
		first.play();
		nowMs = minutes(10);
		first.tick();
		const saved = await reopen(storage, '1970-01-01T00:10:00.000Z');
		nowMs = minutes(30);

		createSession([foreverRoutine], { storage }, { saved });

		expect(await reopen(storage, '1970-01-01T00:30:00.000Z')).toMatchObject({
			run: {
				segments: [{ start: '1970-01-01T00:00:00.000Z', end: '1970-01-01T00:10:00.000Z' }],
				runningSince: null
			}
		});
	});

	it('ends the restored work period on the run Play started, saving its work once', async () => {
		const storage = storageForRuns();
		const first = createSession([foreverRoutine], { storage });
		first.play();
		nowMs = minutes(10);
		first.tick();
		const saved = await reopen(storage, '1970-01-01T00:10:00.000Z');
		nowMs = minutes(30);
		const reopened = createSession([foreverRoutine], { storage }, { saved });
		reopened.play();
		nowMs = minutes(45);

		reopened.next();

		await expect
			.poll(() => storage.getWorkPeriods())
			.toEqual([
				expect.objectContaining({
					runId: 'id-1',
					segments: [
						{ start: '1970-01-01T00:00:00.000Z', end: '1970-01-01T00:10:00.000Z' },
						{ start: '1970-01-01T00:30:00.000Z', end: '1970-01-01T00:45:00.000Z' }
					],
					workedMs: minutes(25)
				})
			]);
		expect(await storage.getRuns()).toEqual([expect.objectContaining({ id: 'id-1' })]);
	});

	it('restores a break with the time it had left at the heartbeat', async () => {
		const storage = storageForRuns();
		const first = createSession([foreverRoutine], { storage });
		first.play();
		nowMs = minutes(25);
		first.next();
		nowMs = minutes(27);
		first.tick();
		const saved = await reopen(storage, '1970-01-01T00:27:00.000Z');
		nowMs = minutes(40);

		const reopened = createSession([foreverRoutine], { storage }, { saved });

		expect(reopened.view).toMatchObject({
			status: 'break',
			earnedMs: minutes(5),
			remainingMs: minutes(3),
			isRunning: false
		});
	});

	it('saves the bank when Next ends a break early', async () => {
		const storage = storageForRuns();
		const session = createSession([foreverRoutine], { storage });
		session.play();
		nowMs = minutes(25);
		session.next();
		nowMs = minutes(27);

		session.next();

		await expect
			.poll(() => storage.getRunInProgress())
			.toMatchObject({ run: { status: 'working', bankedMs: minutes(3) } });
	});

	it('restores a work period with its bank in the break earned', async () => {
		const storage = storageForRuns();
		const first = createSession([foreverRoutine], { storage });
		first.play();
		nowMs = minutes(25);
		first.next();
		nowMs = minutes(27);
		first.next();
		nowMs = minutes(28);
		first.tick();
		const saved = await reopen(storage, '1970-01-01T00:28:00.000Z');
		nowMs = minutes(40);

		const reopened = createSession([foreverRoutine], { storage }, { saved });

		// 1 minute worked at 20% earns 12 seconds, on top of the 3 minutes banked.
		expect(reopened.view).toMatchObject({
			status: 'working',
			workedMs: minutes(1),
			breakEarnedMs: minutes(3) + seconds(12),
			isRunning: false
		});
	});

	it('opens on the summary of a run that had ended, until Done forgets it', async () => {
		const storage = storageForRuns();
		const first = createSession([foreverRoutine], { storage });
		first.play();
		nowMs = minutes(25);
		first.finish();
		const saved = await reopen(storage, '1970-01-01T00:25:00.000Z');
		const reopened = createSession([foreverRoutine], { storage }, { saved });
		expect(reopened.view).toMatchObject({
			status: 'ended',
			summary: { totalWorkMs: minutes(25), periodsCompleted: 1 }
		});

		reopened.readyNewRun();

		await expect.poll(() => storage.getRunInProgress()).toBeNull();
	});

	it('starts as usual, and forgets the saved run, when its routine is gone', async () => {
		const storage = storageForRuns();
		const first = createSession([foreverRoutine], { storage });
		first.play();
		const saved = await reopen(storage, '1970-01-01T00:00:00.000Z');

		const reopened = createSession(routines, { storage }, { saved });

		expect(reopened.routine).toBe(classic);
		expect(reopened.view).toMatchObject({ status: 'ready' });
		await expect.poll(() => storage.getRunInProgress()).toBeNull();
	});
});

/**
 * Opens a second tab on the same storage that is never told of a change, as a tab is until
 * another tab's save reaches it, so a test can press in it as if it had missed a press. It joins
 * the run as another tab had it open.
 *
 * @param storage - The storage the first tab saves to.
 * @param saved - The run in progress storage held as the second tab opened.
 * @param onWorkSaved - What the second tab calls once its save of work has finished.
 * @returns The second tab's session, with ids numbered from `second-1`.
 */
function tabMissingChanges(
	storage: InMemoryStorage,
	saved: StoredRunInProgress | null,
	onWorkSaved: () => void = vi.fn()
): TimerSession {
	vi.spyOn(storage, 'watchRunInProgress').mockImplementationOnce(
		(): (() => void) => (): void => {}
	);
	return createSession(
		[foreverRoutine],
		{ storage, newId: numberedIds('second'), onWorkSaved },
		{ saved, isAnotherTabOpen: true }
	);
}

/**
 * Waits for every call to a storage method a test spied on to finish, so the test can check
 * what each gave, or that nothing came after.
 *
 * @param spy - The spy on the method.
 * @param calls - How many calls to wait for, at least.
 * @returns What each call's promise gave, in the order they were made.
 */
async function settledCalls(
	spy: { mock: { results: { value: unknown }[] } },
	calls: number
): Promise<unknown[]> {
	await vi.waitFor(() => {
		expect(spy.mock.results.length).toBeGreaterThanOrEqual(calls);
	});
	return Promise.all(spy.mock.results.map((result) => result.value));
}

/**
 * Waits until every write, report and read already started has finished, so a test can check
 * that something didn't happen.
 *
 * @remarks
 * `InMemoryStorage` answers and reports in microtasks, and the session chains its writes on
 * promises, so all of them have run by the time the next task, a zero-delay timer, starts.
 */
async function waitForMicrotasks(): Promise<void> {
	await new Promise<void>((resolve) => {
		setTimeout(resolve, 0);
	});
}

describe('sharing the run across tabs', () => {
	// Takes away the log a test chose for errors, and puts back what each test spied on.
	afterEach(() => {
		useErrorLog(null);
		vi.restoreAllMocks();
	});

	it('follows a press in another tab, still running, without saving it again', async () => {
		const storage = storageForRuns();
		const firstTab = createSession([foreverRoutine], { storage, newId: numberedIds('first') });
		const secondTab = createSession([foreverRoutine], { storage, newId: numberedIds('second') });
		const saveSpy = vi.spyOn(storage, 'saveRunInProgress');

		firstTab.play();
		nowMs = minutes(10);

		await expect.poll(() => secondTab.view).toMatchObject({ status: 'working', isRunning: true });
		secondTab.tick();
		expect(secondTab.view).toMatchObject({ workedMs: minutes(10) });
		expect(saveSpy).toHaveBeenCalledOnce();
		expect(await storage.getRuns()).toEqual([expect.objectContaining({ id: 'first-1' })]);
	});

	it('takes on the routine another tab chose and started', async () => {
		const storage = storageHolding(routines);
		const firstTab = createSession(routines, { storage, newId: numberedIds('first') });
		const secondTab = createSession(routines, { storage, newId: numberedIds('second') });

		firstTab.select(classicWithLongBreak.id);
		firstTab.play();

		await expect.poll(() => secondTab.routine).toBe(classicWithLongBreak);
		expect(secondTab.view).toMatchObject({
			status: 'working',
			label: 'Round 1 · Block 1 of 2 · Cycle 1 of 3'
		});
	});

	it('readies a new run of the same routine in every tab once one closes the summary', async () => {
		const storage = storageHolding([classic, foreverRoutine]);
		const firstTab = createSession([classic, foreverRoutine], {
			storage,
			newId: numberedIds('first')
		});
		const secondTab = createSession([classic, foreverRoutine], {
			storage,
			newId: numberedIds('second')
		});
		firstTab.select('forever');
		firstTab.play();
		nowMs = minutes(25);
		firstTab.finish();
		await expect.poll(() => secondTab.view).toMatchObject({ status: 'ended' });

		secondTab.readyNewRun();

		await expect.poll(() => firstTab.view).toMatchObject({ status: 'ready' });
		expect(firstTab.routine).toBe(foreverRoutine);
		expect(await storage.getRunInProgress()).toBeNull();
		expect(await storage.getRuns()).toEqual([expect.objectContaining({ outcome: 'finished' })]);
	});

	it('refuses a press from a tab that missed another’s, saving nothing from it, and takes on the saved run', async () => {
		const storage = storageForRuns();
		const firstTab = createSession([foreverRoutine], { storage, newId: numberedIds('first') });
		firstTab.play();
		const playing = await reopen(storage, '1970-01-01T00:00:00.000Z');
		const onWorkSaved = vi.fn();
		const secondTab = tabMissingChanges(storage, playing, onWorkSaved);
		nowMs = minutes(10);
		firstTab.pause();
		const paused = await reopen(storage, '1970-01-01T00:10:00.000Z');
		nowMs = minutes(12);

		secondTab.next();

		await expect
			.poll(() => secondTab.view)
			.toMatchObject({ status: 'working', workedMs: minutes(10), isRunning: false });
		expect(await storage.getRunInProgress()).toEqual(paused);
		expect(await storage.getWorkPeriods()).toEqual([]);
		expect(onWorkSaved).not.toHaveBeenCalled();
	});

	it('saves a work period once when two tabs end it at the same moment, from the tab whose press was saved', async () => {
		const storage = storageForRuns();
		const firstTabWorkSaved = vi.fn();
		const firstTab = createSession([foreverRoutine], {
			storage,
			newId: numberedIds('first'),
			onWorkSaved: firstTabWorkSaved
		});
		firstTab.play();
		const playing = await reopen(storage, '1970-01-01T00:00:00.000Z');
		const secondTabWorkSaved = vi.fn();
		const secondTab = tabMissingChanges(storage, playing, secondTabWorkSaved);
		const saveSpy = vi.spyOn(storage, 'saveRunInProgress');
		nowMs = minutes(25);

		firstTab.next();
		secondTab.next();

		expect(await settledCalls(saveSpy, 2)).toEqual([true, false]);
		expect(await storage.getWorkPeriods()).toEqual([
			expect.objectContaining({ id: 'first-2', runId: 'first-1', workedMs: minutes(25) })
		]);
		await expect.poll(() => firstTabWorkSaved).toHaveBeenCalledOnce();
		expect(secondTabWorkSaved).not.toHaveBeenCalled();
		await expect.poll(() => secondTab.view).toMatchObject({ status: 'break', isRunning: true });
	});

	it('never lets a heartbeat from a tab that missed a press undo it', async () => {
		const storage = storageForRuns();
		const firstTab = createSession([foreverRoutine], { storage, newId: numberedIds('first') });
		firstTab.play();
		const playing = await reopen(storage, '1970-01-01T00:00:00.000Z');
		const secondTab = tabMissingChanges(storage, playing);
		const heartbeatSpy = vi.spyOn(storage, 'saveHeartbeat');
		nowMs = minutes(10);
		firstTab.pause();
		const paused = await reopen(storage, '1970-01-01T00:10:00.000Z');
		nowMs = minutes(11);

		secondTab.tick();

		expect(await settledCalls(heartbeatSpy, 1)).toEqual([false]);
		expect(await storage.getRunInProgress()).toEqual(paused);
	});

	it('keeps a newer run when a tab that missed it closes the old summary, and takes the newer run on', async () => {
		const storage = storageForRuns();
		const firstTab = createSession([foreverRoutine], { storage, newId: numberedIds('first') });
		firstTab.play();
		nowMs = minutes(25);
		firstTab.finish();
		const ended = await reopen(storage, '1970-01-01T00:25:00.000Z');
		const secondTab = tabMissingChanges(storage, ended);
		firstTab.readyNewRun();
		nowMs = minutes(30);
		firstTab.play();
		const newRun = await reopen(storage, '1970-01-01T00:30:00.000Z');

		secondTab.readyNewRun();

		await expect
			.poll(() => secondTab.view)
			.toMatchObject({ status: 'working', workedMs: 0, isRunning: true });
		expect(await storage.getRunInProgress()).toEqual(newRun);
	});

	it('joins a run live in another tab still running, saving nothing', async () => {
		const storage = storageForRuns();
		const firstTab = createSession([foreverRoutine], { storage, newId: numberedIds('first') });
		firstTab.play();
		nowMs = minutes(10);
		firstTab.tick();
		const live = await reopen(storage, '1970-01-01T00:10:00.000Z');
		const saveSpy = vi.spyOn(storage, 'saveRunInProgress');
		nowMs = minutes(30);

		const secondTab = createSession(
			[foreverRoutine],
			{ storage, newId: numberedIds('second') },
			{ saved: live, isAnotherTabOpen: true }
		);

		expect(secondTab.view).toMatchObject({
			status: 'working',
			workedMs: minutes(30),
			isRunning: true
		});
		await waitForMicrotasks();
		expect(saveSpy).not.toHaveBeenCalled();
		expect(await storage.getRunInProgress()).toEqual(live);
	});

	it('takes on the later of two reads while catching up, even when the earlier finishes last', async () => {
		const storage = storageForRuns();
		const firstTab = createSession([foreverRoutine], { storage, newId: numberedIds('first') });
		const secondTab = createSession([foreverRoutine], { storage, newId: numberedIds('second') });
		// Both tabs hear that nothing is saved yet before the first press, so only the second tab
		// reads.
		await waitForMicrotasks();
		const read = storage.getRunInProgress.bind(storage);
		const { promise: firstReadHeld, resolve: releaseFirstRead } = Promise.withResolvers<void>();
		const readSpy = vi
			.spyOn(storage, 'getRunInProgress')
			.mockImplementationOnce(async (): Promise<StoredRunInProgress | null> => {
				const playing = await read();
				await firstReadHeld;
				return playing;
			});
		firstTab.play();
		await vi.waitFor(() => {
			expect(readSpy).toHaveBeenCalledOnce();
		});
		nowMs = minutes(10);
		firstTab.pause();
		await expect
			.poll(() => secondTab.view)
			.toMatchObject({ isRunning: false, workedMs: minutes(10) });

		releaseFirstRead();
		await waitForMicrotasks();

		expect(secondTab.view).toMatchObject({ isRunning: false, workedMs: minutes(10) });
	});

	it('drops a read that its own press overtook, so it never goes back to the run before the press', async () => {
		const storage = storageForRuns();
		const firstTab = createSession([foreverRoutine], { storage, newId: numberedIds('first') });
		const watch = storage.watchRunInProgress.bind(storage);
		let reportToSecondTab: (runInProgress: StoredRunInProgress | null) => void = () => {};
		vi.spyOn(storage, 'watchRunInProgress').mockImplementationOnce((onChange): (() => void) => {
			reportToSecondTab = onChange;
			return watch(onChange);
		});
		const secondTab = createSession([foreverRoutine], { storage, newId: numberedIds('second') });
		firstTab.play();
		await expect.poll(() => secondTab.view).toMatchObject({ isRunning: true });
		const read = storage.getRunInProgress.bind(storage);
		const { promise: readHeld, resolve: releaseRead } = Promise.withResolvers<void>();
		vi.spyOn(storage, 'getRunInProgress').mockImplementationOnce(
			async (): Promise<StoredRunInProgress | null> => {
				const playing = await read();
				await readHeld;
				return playing;
			}
		);
		// A report of the run before Play, arriving late, as a live query's can.
		reportToSecondTab(null);
		nowMs = minutes(10);
		secondTab.pause();
		const paused = await reopen(storage, '1970-01-01T00:10:00.000Z');

		releaseRead();
		await waitForMicrotasks();

		expect(secondTab.view).toMatchObject({ isRunning: false, workedMs: minutes(10) });
		expect(await storage.getRunInProgress()).toEqual(paused);
	});

	it('leaves its run alone when another tab starts a routine it doesn’t have', async () => {
		const storage = storageHolding([classic, foreverRoutine]);
		const firstTab = createSession([classic, foreverRoutine], {
			storage,
			newId: numberedIds('first')
		});
		// Storage holds the routine, which it must for the first tab's run, but the second tab never
		// hears of it, as one that hasn't yet been told of another tab's new routine wouldn't.
		vi.spyOn(storage, 'watchRoutines').mockReturnValueOnce((): void => {});
		const secondTab = createSession([classic], { storage, newId: numberedIds('second') });

		firstTab.select('forever');
		firstTab.play();

		await reopen(storage, '1970-01-01T00:00:00.000Z');
		await waitForMicrotasks();
		expect(secondTab.routine).toBe(classic);
		expect(secondTab.view).toMatchObject({ status: 'ready' });
	});

	it('records that other tabs can no longer be followed when storage reports an error', async () => {
		// Typed as the interface, whose `watchRunInProgress` takes the `onError` this backend skips.
		const storage: CadoroStorage = storageForRuns();
		useErrorLog(storage);
		vi.spyOn(storage, 'watchRunInProgress').mockImplementationOnce(
			(_onChange, onError): (() => void) => {
				onError(new Error('The disk could not be read.'));
				return (): void => {};
			}
		);

		createSession([foreverRoutine], { storage });

		await expect
			.poll(() => recordedErrors(storage))
			.toEqual([
				[
					'Changes to the run from other tabs can no longer be followed.',
					'The disk could not be read.'
				]
			]);
	});

	it('records a run it can’t read while catching up, and carries on', async () => {
		const storage = storageForRuns();
		const firstTab = createSession([foreverRoutine], { storage, newId: numberedIds('first') });
		firstTab.play();
		const playing = await reopen(storage, '1970-01-01T00:00:00.000Z');
		const secondTab = tabMissingChanges(storage, playing);
		nowMs = minutes(10);
		firstTab.pause();
		await reopen(storage, '1970-01-01T00:10:00.000Z');
		useErrorLog(storage);
		vi.spyOn(storage, 'getRunInProgress').mockRejectedValueOnce(
			new Error('The disk could not be read.')
		);
		nowMs = minutes(25);

		secondTab.next();

		await expect
			.poll(() => recordedErrors(storage))
			.toContainEqual(['The run could not be read.', 'The disk could not be read.']);
		expect(secondTab.view).toMatchObject({ status: 'break' });
		expect(await storage.getWorkPeriods()).toEqual([]);
	});

	it('forgets nothing on Done when every save of the run failed, since none was saved', async () => {
		const storage = storageForRuns();
		const saveSpy = vi
			.spyOn(storage, 'saveRunInProgress')
			.mockRejectedValue(new Error('The disk is full.'));
		const clearSpy = vi.spyOn(storage, 'clearRunInProgress');
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const session = createSession([foreverRoutine], { storage });
		session.play();
		nowMs = minutes(25);
		session.finish();

		session.readyNewRun();

		await waitForMicrotasks();
		expect(saveSpy).toHaveBeenCalledTimes(2);
		expect(clearSpy).not.toHaveBeenCalled();
	});

	it('drops heartbeats after a press’s save fails, so a restore never counts the break as work', async () => {
		const storage = storageForRuns();
		const session = createSession([foreverRoutine], { storage });
		session.play();
		nowMs = minutes(10);
		session.tick();
		const saved = await reopen(storage, '1970-01-01T00:10:00.000Z');
		const failure = new Error('The disk is full.');
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.spyOn(storage, 'saveRunInProgress').mockRejectedValueOnce(failure);
		const heartbeatSpy = vi.spyOn(storage, 'saveHeartbeat');
		nowMs = minutes(25);
		session.next();
		await expect
			.poll(() => consoleError)
			.toHaveBeenCalledWith('The run could not be saved.', failure);

		nowMs = minutes(25) + seconds(1);
		session.tick();

		// The tab is on a break, but storage still holds the running work period, so a heartbeat
		// on it would make a restore count the break as work. Storage refuses it.
		expect(await settledCalls(heartbeatSpy, 1)).toEqual([false]);
		expect(await storage.getRunInProgress()).toEqual(saved);
		const restored = createSession([foreverRoutine], { storage }, { saved });
		expect(restored.view).toMatchObject({ status: 'working', workedMs: minutes(10) });
	});

	it('ends two tabs restoring at once on the same run, with work saved once', async () => {
		const storage = storageForRuns();
		const first = createSession([foreverRoutine], { storage });
		first.play();
		nowMs = minutes(10);
		first.tick();
		const saved = await reopen(storage, '1970-01-01T00:10:00.000Z');
		nowMs = minutes(30);
		const onWorkSaved = vi.fn();
		const saveSpy = vi.spyOn(storage, 'saveRunInProgress');

		const tabA = createSession(
			[foreverRoutine],
			{ storage, newId: numberedIds('a'), onWorkSaved },
			{ saved, isAnotherTabOpen: false }
		);
		const tabB = createSession(
			[foreverRoutine],
			{ storage, newId: numberedIds('b'), onWorkSaved },
			{ saved, isAnotherTabOpen: false }
		);

		const results = await settledCalls(saveSpy, 2);
		expect([...results].sort()).toEqual([false, true]);
		await waitForMicrotasks();
		expect(tabA.view).toEqual(tabB.view);
		expect(tabA.view).toMatchObject({ status: 'working', workedMs: minutes(10), isRunning: false });
		tabA.play();
		nowMs = minutes(45);
		tabA.next();
		await expect.poll(() => storage.getWorkPeriods()).toHaveLength(1);
		await waitForMicrotasks();
		expect(await storage.getWorkPeriods()).toHaveLength(1);
		expect(onWorkSaved).toHaveBeenCalledOnce();
		await expect.poll(() => tabB.view).toMatchObject({ status: 'break' });
	});
});

describe('following the routines', () => {
	/**
	 * Starts a session on storage that holds the routines, as the app opens, with the storage for
	 * the test to change the routines through, as another tab does.
	 *
	 * @returns The storage and a session whose routines are the starter routines.
	 */
	async function sessionOnSavedRoutines(): Promise<{
		storage: InMemoryStorage;
		session: TimerSession;
	}> {
		const storage = storageHolding(routines);
		return { storage, session: createSession(routines, { storage }) };
	}

	it('keeps the routines it opened with when storage reports the same ones', async () => {
		const { session } = await sessionOnSavedRoutines();
		session.select(classicWithLongBreak.id);

		await waitForMicrotasks();

		expect(session.routines).toBe(routines);
		expect(session.routine).toBe(classicWithLongBreak);
	});

	it('shows a routine another tab edited, in the list and as the chosen routine', async () => {
		const { storage, session } = await sessionOnSavedRoutines();

		await storage.saveRoutine({ ...classic, title: 'Renamed', rounds: 2 });

		await expect
			.poll(() => session.routines.map((routine) => routine.title))
			.toEqual(['Renamed', 'Classic with long break']);
		expect(session.routine.title).toBe('Renamed');
		expect(session.view).toMatchObject({ status: 'ready', label: 'Round 1 of 2' });
	});

	it('shows a new routine at its place in the list', async () => {
		const { storage, session } = await sessionOnSavedRoutines();

		await storage.createRoutine(routineWith({ id: 'new', title: 'New', customPosition: 0 }));

		await expect
			.poll(() => session.routines.map((routine) => routine.title))
			.toEqual(['New', 'Classic', 'Classic with long break']);
		expect(session.routine.id).toBe(classic.id);
	});

	it('follows a reorder', async () => {
		const { storage, session } = await sessionOnSavedRoutines();

		await storage.reorderRoutines([classicWithLongBreak.id, classic.id]);

		await expect
			.poll(() => session.routines.map((routine) => routine.title))
			.toEqual(['Classic with long break', 'Classic']);
	});

	it('chooses the first routine when the chosen routine is deleted while its run is ready', async () => {
		const { storage, session } = await sessionOnSavedRoutines();
		session.select(classicWithLongBreak.id);

		await storage.deleteRoutine(classicWithLongBreak.id);

		await expect.poll(() => session.routine.id).toBe(classic.id);
		expect(session.routines.map((routine) => routine.id)).toEqual([classic.id]);
		expect(session.view).toMatchObject({ status: 'ready' });
	});

	it('chooses the first routine in the picker, not in custom order, when the chosen one is deleted', async () => {
		const three = [
			routineWith({ id: 'a', title: 'A', customPosition: 0 }),
			routineWith({ id: 'b', title: 'B', customPosition: 1 }),
			routineWith({ id: 'c', title: 'C', customPosition: 2 })
		];
		const storage = storageHolding(three);
		const session = createSession(three, { storage, pickerOrder: byTitleDescending });
		session.select('b');

		await storage.deleteRoutine('b');

		await expect.poll(() => session.routine.id).toBe('c');
	});

	it('keeps the run in progress as it was started, and readies the new version for the next run', async () => {
		const { storage, session } = await sessionOnSavedRoutines();
		session.play();
		nowMs = seconds(10);

		await storage.saveRoutine({ ...classic, title: 'Renamed' });

		await expect.poll(() => session.routines[0]?.title).toBe('Renamed');
		session.tick();
		expect(session.routine.title).toBe('Classic');
		expect(session.view).toMatchObject({ status: 'working', workedMs: seconds(10) });
		session.finish();
		session.readyNewRun();
		expect(session.routine.title).toBe('Renamed');
		expect(session.view).toMatchObject({ status: 'ready' });
	});

	it('ignores a report with no routines, since there is always one to run', async () => {
		const storage = new InMemoryStorage();
		const session = createSession(routines, { storage });

		await waitForMicrotasks();

		expect(session.routines).toBe(routines);
	});

	it('records that the routines can no longer be followed, and carries on', async () => {
		// Typed as the interface, which has the `onError` that `InMemoryStorage` leaves out.
		const storage: CadoroStorage = new InMemoryStorage();
		useErrorLog(storage);
		vi.spyOn(storage, 'watchRoutines').mockImplementation((_onChange, onError) => {
			onError(new Error('The routines could not be read.'));
			return (): void => {};
		});

		const session = createSession(routines, { storage });

		await expect
			.poll(() => recordedErrors(storage))
			.toEqual([
				['Changes to the routines can no longer be followed.', 'The routines could not be read.']
			]);
		expect(session.routines).toBe(routines);
	});
});
