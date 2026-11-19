import { describe, expect, it } from 'vitest';
import { requireDefined } from '../defined';
import type { StoredRunInProgress } from '../run-in-progress';
import { minutes } from '../testing/durations';
import { routineWith } from '../testing/routines';
import { runInProgressWith, savedRunInProgress } from '../testing/run-in-progress';
import { firstWorkPeriod, runInProgress, runWith, workPeriodWith } from '../testing/run-records';
import { DexieStorage } from './dexie-storage';
import { InMemoryStorage } from './in-memory-storage';
import type { CadoroStorage } from './storage';

/** A backend the shared suite checks. */
type Backend = {
	/** The backend's class name, which names its group of tests. */
	name: string;
	/** Makes a new, empty storage, so no test sees another's data. */
	create: () => CadoroStorage;
};

/** Every backend, each checked against the same tests, so they all keep the same contract. */
const backends: Backend[] = [
	{ name: 'InMemoryStorage', create: () => new InMemoryStorage() },
	// A new database for each test. The test browser starts with no data on every run.
	{ name: 'DexieStorage', create: () => new DexieStorage(`test-${crypto.randomUUID()}`) }
];

/** What a test following the run in progress has been told so far. */
type Reports = {
	/** Each run in progress reported, oldest first. */
	changes: (StoredRunInProgress | null)[];
	/** Stops following. */
	stop: () => void;
};

/**
 * Follows a storage's run in progress, keeping each report for the test to check.
 *
 * @remarks
 * No test here expects storage to report an error, so one is thrown from the report, which
 * Vitest fails the run for as an unhandled error.
 *
 * @param storage - The storage to follow.
 * @returns The reports so far, which grow as storage reports more, and the way to stop.
 */
function follow(storage: CadoroStorage): Reports {
	const changes: (StoredRunInProgress | null)[] = [];
	const stop = storage.watchRunInProgress(
		(runInProgress) => {
			changes.push(runInProgress);
		},
		(error: unknown) => {
			throw new Error('Following the run in progress failed.', { cause: error });
		}
	);
	return { changes, stop };
}

describe.each(backends)('$name', ({ create }) => {
	describe('getRoutines', () => {
		it('returns nothing from empty storage', async () => {
			const storage = create();

			expect(await storage.getRoutines()).toEqual([]);
		});

		it('returns the routines in custom order, whatever order they were added in', async () => {
			const storage = create();
			await storage.addRoutinesIfNone([
				routineWith({ id: 'third', customPosition: 2 }),
				routineWith({ id: 'first', customPosition: 0 }),
				routineWith({ id: 'second', customPosition: 1 })
			]);

			const routines = await storage.getRoutines();

			expect(routines.map((routine) => routine.id)).toEqual(['first', 'second', 'third']);
		});

		it('leaves out deleted routines', async () => {
			const storage = create();
			await storage.addRoutinesIfNone([
				routineWith({ id: 'kept', customPosition: 0 }),
				routineWith({ id: 'deleted', customPosition: 1, deletedAt: '2026-01-05T09:00:00.000Z' })
			]);

			const routines = await storage.getRoutines();

			expect(routines.map((routine) => routine.id)).toEqual(['kept']);
		});

		it('returns copies, so changing one leaves the saved routine unchanged', async () => {
			const storage = create();
			await storage.addRoutinesIfNone([routineWith({ title: 'Writing' })]);
			const [read] = await storage.getRoutines();
			const readRoutine = requireDefined(read, 'the saved routine');
			readRoutine.title = 'Changed';
			requireDefined(readRoutine.blocks[0], "the routine's block").targetMinutes = 50;

			const [readAgain] = await storage.getRoutines();

			expect(readAgain?.title).toBe('Writing');
			expect(readAgain?.blocks[0]?.targetMinutes).toBe(25);
		});
	});

	describe('addRoutinesIfNone', () => {
		it('saves every field of the routines into empty storage, and says it did', async () => {
			const storage = create();
			const routine = routineWith({
				id: 'writing',
				title: 'Writing',
				rounds: 'infinite',
				blocks: [
					{ id: 'draft', title: 'Draft', targetMinutes: 50, breakPercent: 20, cycles: 2 },
					{ id: 'edit', title: 'Edit', targetMinutes: 30, breakPercent: 10, cycles: 1 }
				],
				customPosition: 0,
				createdAt: '2026-01-05T09:00:00.000Z'
			});

			const added = await storage.addRoutinesIfNone([routine]);

			expect(added).toBe(true);
			expect(await storage.getRoutines()).toEqual([routine]);
		});

		it('refuses when storage holds routines, and keeps the ones it has', async () => {
			const storage = create();
			await storage.addRoutinesIfNone([routineWith({ id: 'existing' })]);

			const added = await storage.addRoutinesIfNone([routineWith({ id: 'new' })]);

			expect(added).toBe(false);
			const routines = await storage.getRoutines();
			expect(routines.map((routine) => routine.id)).toEqual(['existing']);
		});

		it('refuses when the only routine is deleted, so deleted starters never come back', async () => {
			const storage = create();
			await storage.addRoutinesIfNone([
				routineWith({ id: 'deleted', deletedAt: '2026-01-05T09:00:00.000Z' })
			]);

			const added = await storage.addRoutinesIfNone([routineWith({ id: 'new' })]);

			expect(added).toBe(false);
			expect(await storage.getRoutines()).toEqual([]);
		});

		it('saves copies, so changing a routine after adding it leaves the saved one unchanged', async () => {
			const storage = create();
			const routine = routineWith({ title: 'Writing' });
			await storage.addRoutinesIfNone([routine]);
			routine.title = 'Changed';

			const [saved] = await storage.getRoutines();

			expect(saved?.title).toBe('Writing');
		});
	});

	describe('saveRunInProgress', () => {
		it('saves every field of a run and its work periods', async () => {
			const storage = create();
			const pausedPeriod = workPeriodWith({
				id: 'period-2',
				segments: [
					{ start: '2026-11-19T09:30:00.000Z', end: '2026-11-19T09:40:00.000Z' },
					{ start: '2026-11-19T09:45:00.000Z', end: '2026-11-19T10:00:00.250Z' }
				],
				workedMs: 1_500_250
			});

			await storage.saveRunInProgress(savedRunInProgress, null, {
				run: runInProgress,
				workPeriods: [firstWorkPeriod, pausedPeriod]
			});

			expect(await storage.getRuns()).toEqual([runInProgress]);
			expect(await storage.getWorkPeriods()).toEqual([firstWorkPeriod, pausedPeriod]);
		});

		it('replaces the run when it is saved again as it ends', async () => {
			const storage = create();
			await storage.saveRunInProgress(savedRunInProgress, null, {
				run: runInProgress,
				workPeriods: []
			});
			const endedRun = runWith({
				endedAt: '2026-11-19T09:25:00.000Z',
				outcome: 'completed',
				roundsReached: 1
			});

			await storage.saveRunInProgress(savedRunInProgress, 'revision-1', {
				run: endedRun,
				workPeriods: [firstWorkPeriod]
			});

			expect(await storage.getRuns()).toEqual([endedRun]);
		});

		it('adds work periods and leaves the run as it was when the run is null', async () => {
			const storage = create();
			await storage.saveRunInProgress(savedRunInProgress, null, {
				run: runInProgress,
				workPeriods: []
			});

			await storage.saveRunInProgress(savedRunInProgress, 'revision-1', {
				run: null,
				workPeriods: [firstWorkPeriod]
			});

			expect(await storage.getRuns()).toEqual([runInProgress]);
			expect(await storage.getWorkPeriods()).toEqual([firstWorkPeriod]);
		});

		it('rejects a work period whose id is already saved, and saves nothing from that call', async () => {
			const storage = create();
			await storage.saveRunInProgress(savedRunInProgress, null, {
				run: runInProgress,
				workPeriods: [firstWorkPeriod]
			});
			const newPeriod = workPeriodWith({ id: 'period-2' });
			const endedRun = runWith({ endedAt: '2026-11-19T09:50:00.000Z', outcome: 'finished' });
			const endedRunInProgress = runInProgressWith({
				run: { status: 'ended', endedPeriods: [], outcome: 'finished' },
				heartbeatAt: '2026-11-19T09:50:00.000Z',
				revision: 'revision-2'
			});

			await expect(
				storage.saveRunInProgress(endedRunInProgress, 'revision-1', {
					run: endedRun,
					workPeriods: [newPeriod, firstWorkPeriod]
				})
			).rejects.toThrow();

			expect(await storage.getRunInProgress()).toEqual(savedRunInProgress);
			expect(await storage.getRuns()).toEqual([runInProgress]);
			expect(await storage.getWorkPeriods()).toEqual([firstWorkPeriod]);
		});

		it('saves copies, so changing records after saving them leaves the saved ones unchanged', async () => {
			const storage = create();
			const run = runWith({});
			const period = workPeriodWith({});
			await storage.saveRunInProgress(savedRunInProgress, null, { run, workPeriods: [period] });
			run.roundsReached = 5;
			requireDefined(period.segments[0], "the period's segment").end = '2026-11-19T11:00:00.000Z';

			expect(await storage.getRuns()).toEqual([runInProgress]);
			expect(await storage.getWorkPeriods()).toEqual([firstWorkPeriod]);
		});

		it('saves every field of the run in progress', async () => {
			const storage = create();
			const onBreak = runInProgressWith({
				run: {
					status: 'break',
					endedPeriods: [
						{
							position: { round: 0, block: 0, cycle: 0 },
							targetMinutes: 25,
							segments: [{ start: '2026-11-19T09:00:00.000Z', end: '2026-11-19T09:25:00.250Z' }],
							workedMs: minutes(25) + 250
						}
					],
					position: { round: 0, block: 0, cycle: 0 },
					nextWorkPosition: { round: 1, block: 0, cycle: 0 },
					earnedMs: minutes(5),
					remainingMs: minutes(4),
					runningSince: null
				},
				heartbeatAt: '2026-11-19T09:26:00.000Z'
			});

			await storage.saveRunInProgress(onBreak, null);

			expect(await storage.getRunInProgress()).toEqual(onBreak);
		});

		it('replaces the run in progress with each save, leaving runs and work periods alone when it keeps nothing new', async () => {
			const storage = create();
			await storage.saveRunInProgress(savedRunInProgress, null, {
				run: runInProgress,
				workPeriods: [firstWorkPeriod]
			});
			const later = runInProgressWith({
				heartbeatAt: '2026-11-19T09:10:01.000Z',
				revision: 'revision-2'
			});

			await storage.saveRunInProgress(later, 'revision-1');

			expect(await storage.getRunInProgress()).toEqual(later);
			expect(await storage.getRuns()).toEqual([runInProgress]);
			expect(await storage.getWorkPeriods()).toEqual([firstWorkPeriod]);
		});

		it('saves a copy, so changing the run in progress after saving it leaves the saved one unchanged', async () => {
			const storage = create();
			const saved = runInProgressWith({});
			await storage.saveRunInProgress(saved, null);
			saved.heartbeatAt = '2026-11-19T11:00:00.000Z';
			saved.record.roundsReached = 5;

			expect(await storage.getRunInProgress()).toEqual(savedRunInProgress);
		});

		it('says it saved a change worked out from the revision saved', async () => {
			const storage = create();
			const firstSaved = await storage.saveRunInProgress(savedRunInProgress, null);
			const paused = runInProgressWith({ revision: 'revision-2' });

			const secondSaved = await storage.saveRunInProgress(paused, 'revision-1');

			expect([firstSaved, secondSaved]).toEqual([true, true]);
			expect(await storage.getRunInProgress()).toEqual(paused);
		});

		it('refuses a change worked out from another revision, as from a tab that missed a press, and saves nothing from it', async () => {
			const storage = create();
			await storage.saveRunInProgress(savedRunInProgress, null, {
				run: runInProgress,
				workPeriods: []
			});
			const stale = runInProgressWith({
				run: { status: 'ended', endedPeriods: [], outcome: 'finished' },
				revision: 'revision-3'
			});

			const saved = await storage.saveRunInProgress(stale, 'revision-2', {
				run: runWith({ endedAt: '2026-11-19T09:25:00.000Z', outcome: 'finished' }),
				workPeriods: [firstWorkPeriod]
			});

			expect(saved).toBe(false);
			expect(await storage.getRunInProgress()).toEqual(savedRunInProgress);
			expect(await storage.getRuns()).toEqual([runInProgress]);
			expect(await storage.getWorkPeriods()).toEqual([]);
		});

		it('refuses a change worked out with none saved once a run in progress is saved, as another tab’s Play', async () => {
			const storage = create();
			await storage.saveRunInProgress(savedRunInProgress, null);
			const otherStart = runInProgressWith({
				record: runWith({ id: 'run-2' }),
				revision: 'revision-2'
			});

			const saved = await storage.saveRunInProgress(otherStart, null, {
				run: runWith({ id: 'run-2' }),
				workPeriods: []
			});

			expect(saved).toBe(false);
			expect(await storage.getRunInProgress()).toEqual(savedRunInProgress);
			expect(await storage.getRuns()).toEqual([]);
		});

		it('refuses a change worked out from a run in progress that has since been forgotten', async () => {
			const storage = create();
			await storage.saveRunInProgress(savedRunInProgress, null);
			await storage.clearRunInProgress('revision-1');

			const saved = await storage.saveRunInProgress(
				runInProgressWith({ revision: 'revision-2' }),
				'revision-1'
			);

			expect(saved).toBe(false);
			expect(await storage.getRunInProgress()).toBeNull();
		});

		it('saves only one of two changes worked out from the same revision, as two tabs pressing at once, so work is saved once', async () => {
			const storage = create();
			await storage.saveRunInProgress(savedRunInProgress, null);
			const fromFirstTab = runInProgressWith({ revision: 'first-tab' });
			const fromSecondTab = runInProgressWith({ revision: 'second-tab' });

			const saved = await Promise.all([
				storage.saveRunInProgress(fromFirstTab, 'revision-1', {
					run: null,
					workPeriods: [workPeriodWith({ id: 'first-tab-period' })]
				}),
				storage.saveRunInProgress(fromSecondTab, 'revision-1', {
					run: null,
					workPeriods: [workPeriodWith({ id: 'second-tab-period' })]
				})
			]);

			expect(saved.toSorted()).toEqual([false, true]);
			const winner = saved[0] === true ? fromFirstTab : fromSecondTab;
			expect(await storage.getRunInProgress()).toEqual(winner);
			expect(await storage.getWorkPeriods()).toHaveLength(1);
		});
	});

	describe('saveHeartbeat', () => {
		it('moves the heartbeat on, changing nothing else, and says it did', async () => {
			const storage = create();
			await storage.saveRunInProgress(savedRunInProgress, null);

			const saved = await storage.saveHeartbeat('revision-1', '2026-11-19T09:10:01.000Z');

			expect(saved).toBe(true);
			expect(await storage.getRunInProgress()).toEqual(
				runInProgressWith({ heartbeatAt: '2026-11-19T09:10:01.000Z' })
			);
		});

		it('drops a heartbeat for another revision, so a tab that missed a press can’t undo it', async () => {
			const storage = create();
			await storage.saveRunInProgress(savedRunInProgress, null);

			const saved = await storage.saveHeartbeat('revision-0', '2026-11-19T09:10:01.000Z');

			expect(saved).toBe(false);
			expect(await storage.getRunInProgress()).toEqual(savedRunInProgress);
		});

		it('drops a heartbeat earlier than the one saved', async () => {
			const storage = create();
			await storage.saveRunInProgress(savedRunInProgress, null);

			const saved = await storage.saveHeartbeat('revision-1', '2026-11-19T09:09:59.000Z');

			expect(saved).toBe(false);
			expect(await storage.getRunInProgress()).toEqual(savedRunInProgress);
		});

		it('drops a heartbeat when no run in progress is saved, rather than saving one', async () => {
			const storage = create();

			const saved = await storage.saveHeartbeat('revision-1', '2026-11-19T09:10:01.000Z');

			expect(saved).toBe(false);
			expect(await storage.getRunInProgress()).toBeNull();
		});
	});

	describe('getRunInProgress', () => {
		it('returns null from empty storage', async () => {
			const storage = create();

			expect(await storage.getRunInProgress()).toBeNull();
		});

		it('returns a copy, so changing it leaves the saved run in progress unchanged', async () => {
			const storage = create();
			await storage.saveRunInProgress(savedRunInProgress, null);
			const read = await storage.getRunInProgress();
			if (read === null) {
				throw new Error('The run in progress should have been saved.');
			}
			read.heartbeatAt = '2026-11-19T11:00:00.000Z';

			expect(await storage.getRunInProgress()).toEqual(savedRunInProgress);
		});
	});

	describe('watchRunInProgress', () => {
		it('reports the run in progress soon after following starts, and not during the call', async () => {
			const storage = create();
			await storage.saveRunInProgress(savedRunInProgress, null);

			const reports = follow(storage);

			expect(reports.changes).toEqual([]);
			await expect.poll(() => reports.changes).toEqual([savedRunInProgress]);
		});

		it('reports null when no run in progress is saved', async () => {
			const storage = create();

			const reports = follow(storage);

			await expect.poll(() => reports.changes).toEqual([null]);
		});

		it('reports each change: a save, a heartbeat and a forgotten run', async () => {
			const storage = create();
			const reports = follow(storage);
			await expect.poll(() => reports.changes).toEqual([null]);

			await storage.saveRunInProgress(savedRunInProgress, null);
			await expect.poll(() => reports.changes.at(-1)).toEqual(savedRunInProgress);
			await storage.saveHeartbeat('revision-1', '2026-11-19T09:10:01.000Z');
			await expect
				.poll(() => reports.changes.at(-1))
				.toEqual(runInProgressWith({ heartbeatAt: '2026-11-19T09:10:01.000Z' }));
			await storage.clearRunInProgress('revision-1');

			await expect.poll(() => reports.changes.at(-1)).toBeNull();
		});

		it('reports to everything following, as each open tab follows', async () => {
			const storage = create();
			const first = follow(storage);
			const second = follow(storage);

			await storage.saveRunInProgress(savedRunInProgress, null);

			await expect.poll(() => first.changes.at(-1)).toEqual(savedRunInProgress);
			await expect.poll(() => second.changes.at(-1)).toEqual(savedRunInProgress);
		});

		it('reports nothing more once stopped', async () => {
			const storage = create();
			const stopped = follow(storage);
			const still = follow(storage);
			await expect.poll(() => stopped.changes).toEqual([null]);

			stopped.stop();
			await storage.saveRunInProgress(savedRunInProgress, null);

			// Reports go out together, so once the one still following hears, the other would have.
			await expect.poll(() => still.changes.at(-1)).toEqual(savedRunInProgress);
			expect(stopped.changes).toEqual([null]);
		});

		it('reports copies, so changing one leaves the saved run in progress unchanged', async () => {
			const storage = create();
			await storage.saveRunInProgress(savedRunInProgress, null);
			const reports = follow(storage);
			await expect.poll(() => reports.changes).toHaveLength(1);

			requireDefined(reports.changes[0] ?? undefined, 'the run reported').heartbeatAt =
				'2026-11-19T11:00:00.000Z';

			expect(await storage.getRunInProgress()).toEqual(savedRunInProgress);
		});
	});

	describe('clearRunInProgress', () => {
		it('forgets the run in progress, and keeps its run and work periods', async () => {
			const storage = create();
			await storage.saveRunInProgress(savedRunInProgress, null, {
				run: runInProgress,
				workPeriods: [firstWorkPeriod]
			});

			const cleared = await storage.clearRunInProgress('revision-1');

			expect(cleared).toBe(true);
			expect(await storage.getRunInProgress()).toBeNull();
			expect(await storage.getRuns()).toEqual([runInProgress]);
			expect(await storage.getWorkPeriods()).toEqual([firstWorkPeriod]);
		});

		it('does nothing when no run in progress is saved', async () => {
			const storage = create();

			const cleared = await storage.clearRunInProgress('revision-1');

			expect(cleared).toBe(false);
			expect(await storage.getRunInProgress()).toBeNull();
		});

		it('keeps a run in progress with another revision, so a tab that missed a newer run can’t forget it', async () => {
			const storage = create();
			await storage.saveRunInProgress(savedRunInProgress, null);

			const cleared = await storage.clearRunInProgress('revision-0');

			expect(cleared).toBe(false);
			expect(await storage.getRunInProgress()).toEqual(savedRunInProgress);
		});
	});

	describe('getRuns', () => {
		it('returns nothing from empty storage', async () => {
			const storage = create();

			expect(await storage.getRuns()).toEqual([]);
		});

		it('returns the runs in the order they started, whatever order they were saved in', async () => {
			const storage = create();
			await storage.saveRunInProgress(savedRunInProgress, null, {
				run: runWith({ id: 'afternoon', startedAt: '2026-11-19T14:00:00.000Z' }),
				workPeriods: []
			});
			await storage.saveRunInProgress(savedRunInProgress, 'revision-1', {
				run: runWith({ id: 'morning', startedAt: '2026-11-19T09:00:00.000Z' }),
				workPeriods: []
			});

			const runs = await storage.getRuns();

			expect(runs.map((run) => run.id)).toEqual(['morning', 'afternoon']);
		});

		it('returns copies, so changing one leaves the saved run unchanged', async () => {
			const storage = create();
			await storage.saveRunInProgress(savedRunInProgress, null, {
				run: runInProgress,
				workPeriods: []
			});
			const [read] = await storage.getRuns();
			requireDefined(read, 'the saved run').roundsReached = 5;

			expect(await storage.getRuns()).toEqual([runInProgress]);
		});
	});

	describe('getWorkPeriods', () => {
		it('returns nothing from empty storage', async () => {
			const storage = create();

			expect(await storage.getWorkPeriods()).toEqual([]);
		});

		it('returns the work periods in the order they started, whatever order they were saved in', async () => {
			const storage = create();
			await storage.saveRunInProgress(savedRunInProgress, null, {
				run: null,
				workPeriods: [
					workPeriodWith({
						id: 'second',
						segments: [{ start: '2026-11-19T09:30:00.000Z', end: '2026-11-19T09:55:00.000Z' }]
					}),
					workPeriodWith({
						id: 'first',
						segments: [{ start: '2026-11-19T09:00:00.000Z', end: '2026-11-19T09:25:00.000Z' }]
					})
				]
			});

			const periods = await storage.getWorkPeriods();

			expect(periods.map((period) => period.id)).toEqual(['first', 'second']);
		});

		it('returns copies, so changing one leaves the saved work period unchanged', async () => {
			const storage = create();
			await storage.saveRunInProgress(savedRunInProgress, null, {
				run: null,
				workPeriods: [firstWorkPeriod]
			});
			const [read] = await storage.getWorkPeriods();
			const readSegment = requireDefined(read?.segments[0], "the saved work period's segment");
			readSegment.end = '2026-11-19T11:00:00.000Z';

			expect(await storage.getWorkPeriods()).toEqual([firstWorkPeriod]);
		});
	});

	describe('hasWorkPeriods', () => {
		it('says no for empty storage, and while only a run is saved', async () => {
			const storage = create();
			expect(await storage.hasWorkPeriods()).toBe(false);

			await storage.saveRunInProgress(savedRunInProgress, null, {
				run: runInProgress,
				workPeriods: []
			});

			expect(await storage.hasWorkPeriods()).toBe(false);
		});

		it('says yes once a work period is saved', async () => {
			const storage = create();

			await storage.saveRunInProgress(savedRunInProgress, null, {
				run: runInProgress,
				workPeriods: [firstWorkPeriod]
			});

			expect(await storage.hasWorkPeriods()).toBe(true);
		});
	});
});
