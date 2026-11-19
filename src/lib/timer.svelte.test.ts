import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createStarterRoutines, type Routine } from './routine';
import type { StoredRunInProgress } from './run-in-progress';
import type { RunRecords } from './run-records';
import { InMemoryStorage } from './storage/in-memory-storage';
import { minutes, seconds } from './testing/durations';
import { numberedIds } from './testing/ids';
import { oneRoundRoutine, routineWith } from './testing/routines';
import { TimerSession, type TimerSessionOptions } from './timer.svelte';

/** The starter routines, Classic then Classic with long break, with predictable ids. */
const routines = createStarterRoutines(new Date(0), numberedIds());

/** The starter routines, by name. */
const [classic, classicWithLongBreak] = routines;

/** The one-round routine's 25-minute block at 20%, repeating forever, so Next always starts a break. */
const foreverRoutine = routineWith({ id: 'forever', title: 'Forever', rounds: 'infinite' });

/** The fake clock's current moment, in milliseconds since 1970, which each test moves by hand. */
let nowMs = 0;

/**
 * Starts a session on the fake clock, with ids numbered from `id-1`.
 *
 * @param choices - The routines to pick from. The starter routines unless a test needs others.
 * @param options - The options a test reads, `storage` and `onWorkSaved`. Unless given, the
 * session saves to new, empty storage, and `onWorkSaved` is a spy nothing checks.
 * @param saved - The run in progress the app found saved as it opened, or `null` for none.
 * @returns A new session, carrying on the saved run, or with the first routine chosen and its run
 * ready.
 */
function createSession(
	choices: readonly Routine[] = routines,
	options: Partial<Pick<TimerSessionOptions, 'storage' | 'onWorkSaved'>> = {},
	saved: StoredRunInProgress | null = null
): TimerSession {
	return new TimerSession(
		choices,
		{
			clock: () => nowMs,
			storage: new InMemoryStorage(),
			newId: numberedIds(),
			onWorkSaved: vi.fn(),
			...options
		},
		saved
	);
}

beforeEach(() => {
	nowMs = 0;
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
	// Puts back what each test spied on, such as `console.error` and storage's methods.
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('saves a whole run: its start, each work period and how it ended', async () => {
		const storage = new InMemoryStorage();
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
		const storage = new InMemoryStorage();
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
		const storage = new InMemoryStorage();
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
		const storage = new InMemoryStorage();
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
					runningSince: null
				},
				heartbeatAt: '1970-01-01T00:10:00.000Z'
			});
	});

	it('saves the ended run as the run in progress, so its summary can come back', async () => {
		const storage = new InMemoryStorage();
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
		const storage = new InMemoryStorage();
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
		const storage = new InMemoryStorage();
		const save = storage.saveRunInProgress.bind(storage);
		const { promise: firstSaveHeld, resolve: releaseFirstSave } = Promise.withResolvers<void>();
		const saveSpy = vi
			.spyOn(storage, 'saveRunInProgress')
			.mockImplementationOnce(async (runInProgress: StoredRunInProgress, records?: RunRecords) => {
				await firstSaveHeld;
				await save(runInProgress, records);
			});
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

	it('logs a save that fails, and carries on timing and saving', async () => {
		const storage = new InMemoryStorage();
		const failure = new Error('The disk is full.');
		vi.spyOn(storage, 'saveRunInProgress').mockRejectedValueOnce(failure);
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		const session = createSession([foreverRoutine], { storage });
		session.play();
		nowMs = minutes(25);

		session.next();

		expect(session.view).toMatchObject({ status: 'break', earnedMs: minutes(5) });
		await expect.poll(() => storage.getWorkPeriods()).toHaveLength(1);
		expect(consoleError).toHaveBeenCalledWith('The run could not be saved.', failure);
	});

	it('says work is saved once each work period is, and not for the run alone', async () => {
		const storage = new InMemoryStorage();
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

	it('says nothing about work whose save failed', async () => {
		const storage = new InMemoryStorage();
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
		const storage = new InMemoryStorage();
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
		const storage = new InMemoryStorage();
		const saveSpy = vi.spyOn(storage, 'saveRunInProgress');
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
	});

	it('forgets the run in progress once Done readies a new run, and keeps its records', async () => {
		const storage = new InMemoryStorage();
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
		const storage = new InMemoryStorage();
		const session = createSession([foreverRoutine], { storage });
		session.play();
		await reopen(storage, '1970-01-01T00:00:00.000Z');
		const save = storage.saveRunInProgress.bind(storage);
		const { promise: heartbeatHeld, resolve: releaseHeartbeat } = Promise.withResolvers<void>();
		const saveSpy = vi
			.spyOn(storage, 'saveRunInProgress')
			.mockImplementationOnce(async (runInProgress: StoredRunInProgress, records?: RunRecords) => {
				await heartbeatHeld;
				await save(runInProgress, records);
			});
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
			[...saveSpy.mock.results, ...clearSpy.mock.results].map((result): unknown => result.value)
		);

		expect(await storage.getRunInProgress()).toBeNull();
	});

	it('carries on a saved run with its routine chosen, paused at its last heartbeat', async () => {
		const storage = new InMemoryStorage();
		const first = createSession([classic, foreverRoutine], { storage });
		first.select('forever');
		first.play();
		nowMs = minutes(10);
		first.tick();
		const saved = await reopen(storage, '1970-01-01T00:10:00.000Z');
		nowMs = minutes(30);

		const reopened = createSession([classic, foreverRoutine], { storage }, saved);

		expect(reopened.routine).toBe(foreverRoutine);
		expect(reopened.view).toMatchObject({
			status: 'working',
			workedMs: minutes(10),
			isRunning: false,
			isInProgress: true
		});
	});

	it('saves the restored run as paused, so storage shows what the screen does', async () => {
		const storage = new InMemoryStorage();
		const first = createSession([foreverRoutine], { storage });
		first.play();
		nowMs = minutes(10);
		first.tick();
		const saved = await reopen(storage, '1970-01-01T00:10:00.000Z');
		nowMs = minutes(30);

		createSession([foreverRoutine], { storage }, saved);

		expect(await reopen(storage, '1970-01-01T00:30:00.000Z')).toMatchObject({
			run: {
				segments: [{ start: '1970-01-01T00:00:00.000Z', end: '1970-01-01T00:10:00.000Z' }],
				runningSince: null
			}
		});
	});

	it('ends the restored work period on the run Play started, saving its work once', async () => {
		const storage = new InMemoryStorage();
		const first = createSession([foreverRoutine], { storage });
		first.play();
		nowMs = minutes(10);
		first.tick();
		const saved = await reopen(storage, '1970-01-01T00:10:00.000Z');
		nowMs = minutes(30);
		const reopened = createSession([foreverRoutine], { storage }, saved);
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
		const storage = new InMemoryStorage();
		const first = createSession([foreverRoutine], { storage });
		first.play();
		nowMs = minutes(25);
		first.next();
		nowMs = minutes(27);
		first.tick();
		const saved = await reopen(storage, '1970-01-01T00:27:00.000Z');
		nowMs = minutes(40);

		const reopened = createSession([foreverRoutine], { storage }, saved);

		expect(reopened.view).toMatchObject({
			status: 'break',
			earnedMs: minutes(5),
			remainingMs: minutes(3),
			isRunning: false
		});
	});

	it('opens on the summary of a run that had ended, until Done forgets it', async () => {
		const storage = new InMemoryStorage();
		const first = createSession([foreverRoutine], { storage });
		first.play();
		nowMs = minutes(25);
		first.finish();
		const saved = await reopen(storage, '1970-01-01T00:25:00.000Z');
		const reopened = createSession([foreverRoutine], { storage }, saved);
		expect(reopened.view).toMatchObject({
			status: 'ended',
			summary: { totalWorkMs: minutes(25), periodsCompleted: 1 }
		});

		reopened.readyNewRun();

		await expect.poll(() => storage.getRunInProgress()).toBeNull();
	});

	it('starts as usual, and forgets the saved run, when its routine is gone', async () => {
		const storage = new InMemoryStorage();
		const first = createSession([foreverRoutine], { storage });
		first.play();
		const saved = await reopen(storage, '1970-01-01T00:00:00.000Z');

		const reopened = createSession(routines, { storage }, saved);

		expect(reopened.routine).toBe(classic);
		expect(reopened.view).toMatchObject({ status: 'ready' });
		await expect.poll(() => storage.getRunInProgress()).toBeNull();
	});
});
