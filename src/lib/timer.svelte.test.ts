import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createStarterRoutines, type Routine } from './routine';
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

/** The fake clock's current moment, in milliseconds since 1970, which each test moves by hand. */
let nowMs = 0;

/**
 * Starts a session on the fake clock, with ids numbered from `id-1`.
 *
 * @param choices - The routines to pick from. The starter routines unless a test needs others.
 * @param options - The options a test reads, `storage` and `onWorkSaved`. Unless given, the
 * session saves to new, empty storage, and `onWorkSaved` is a spy nothing checks.
 * @returns A new session, with the first routine chosen and its run ready.
 */
function createSession(
	choices: readonly Routine[] = routines,
	options: Partial<Pick<TimerSessionOptions, 'storage' | 'onWorkSaved'>> = {}
): TimerSession {
	return new TimerSession(choices, {
		clock: () => nowMs,
		storage: new InMemoryStorage(),
		newId: numberedIds(),
		onWorkSaved: vi.fn(),
		...options
	});
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
	/** The one-round routine's block, repeating forever, so Next always starts a break. */
	const foreverRoutine = routineWith({ id: 'forever', title: 'Forever', rounds: 'infinite' });

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

	it('saves each press in order, even when an earlier save is slow', async () => {
		const storage = new InMemoryStorage();
		const save = storage.saveRunRecords.bind(storage);
		const { promise: firstSaveHeld, resolve: releaseFirstSave } = Promise.withResolvers<void>();
		const saveSpy = vi
			.spyOn(storage, 'saveRunRecords')
			.mockImplementationOnce(async (records: RunRecords) => {
				await firstSaveHeld;
				await save(records);
			});
		const session = createSession([oneRoundRoutine], { storage });
		session.play();
		nowMs = minutes(26);
		session.next();

		releaseFirstSave();
		await vi.waitFor(() => {
			expect(saveSpy).toHaveBeenCalledTimes(2);
		});
		await Promise.all(saveSpy.mock.results.map((result) => result.value));

		expect(await storage.getRuns()).toEqual([
			expect.objectContaining({ id: 'id-1', outcome: 'completed' })
		]);
	});

	it('logs a save that fails, and carries on timing and saving', async () => {
		const storage = new InMemoryStorage();
		const failure = new Error('The disk is full.');
		vi.spyOn(storage, 'saveRunRecords').mockRejectedValueOnce(failure);
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
		const saveSpy = vi.spyOn(storage, 'saveRunRecords');
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
