import { describe, expect, it } from 'vitest';
import { requireDefined } from '../defined';
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

			await storage.saveRunInProgress(savedRunInProgress, {
				run: runInProgress,
				workPeriods: [firstWorkPeriod, pausedPeriod]
			});

			expect(await storage.getRuns()).toEqual([runInProgress]);
			expect(await storage.getWorkPeriods()).toEqual([firstWorkPeriod, pausedPeriod]);
		});

		it('replaces the run when it is saved again as it ends', async () => {
			const storage = create();
			await storage.saveRunInProgress(savedRunInProgress, { run: runInProgress, workPeriods: [] });
			const endedRun = runWith({
				endedAt: '2026-11-19T09:25:00.000Z',
				outcome: 'completed',
				roundsReached: 1
			});

			await storage.saveRunInProgress(savedRunInProgress, {
				run: endedRun,
				workPeriods: [firstWorkPeriod]
			});

			expect(await storage.getRuns()).toEqual([endedRun]);
		});

		it('adds work periods and leaves the run as it was when the run is null', async () => {
			const storage = create();
			await storage.saveRunInProgress(savedRunInProgress, { run: runInProgress, workPeriods: [] });

			await storage.saveRunInProgress(savedRunInProgress, {
				run: null,
				workPeriods: [firstWorkPeriod]
			});

			expect(await storage.getRuns()).toEqual([runInProgress]);
			expect(await storage.getWorkPeriods()).toEqual([firstWorkPeriod]);
		});

		it('rejects a work period whose id is already saved, and saves nothing from that call', async () => {
			const storage = create();
			await storage.saveRunInProgress(savedRunInProgress, {
				run: runInProgress,
				workPeriods: [firstWorkPeriod]
			});
			const newPeriod = workPeriodWith({ id: 'period-2' });
			const endedRun = runWith({ endedAt: '2026-11-19T09:50:00.000Z', outcome: 'finished' });
			const endedRunInProgress = runInProgressWith({
				run: { status: 'ended', endedPeriods: [], outcome: 'finished' },
				heartbeatAt: '2026-11-19T09:50:00.000Z'
			});

			await expect(
				storage.saveRunInProgress(endedRunInProgress, {
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
			await storage.saveRunInProgress(savedRunInProgress, { run, workPeriods: [period] });
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

			await storage.saveRunInProgress(onBreak);

			expect(await storage.getRunInProgress()).toEqual(onBreak);
		});

		it('replaces the run in progress with each save, leaving runs and work periods alone, as a heartbeat does', async () => {
			const storage = create();
			await storage.saveRunInProgress(savedRunInProgress, {
				run: runInProgress,
				workPeriods: [firstWorkPeriod]
			});
			const later = runInProgressWith({ heartbeatAt: '2026-11-19T09:10:01.000Z' });

			await storage.saveRunInProgress(later);

			expect(await storage.getRunInProgress()).toEqual(later);
			expect(await storage.getRuns()).toEqual([runInProgress]);
			expect(await storage.getWorkPeriods()).toEqual([firstWorkPeriod]);
		});

		it('saves a copy, so changing the run in progress after saving it leaves the saved one unchanged', async () => {
			const storage = create();
			const saved = runInProgressWith({});
			await storage.saveRunInProgress(saved);
			saved.heartbeatAt = '2026-11-19T11:00:00.000Z';
			saved.record.roundsReached = 5;

			expect(await storage.getRunInProgress()).toEqual(savedRunInProgress);
		});
	});

	describe('getRunInProgress', () => {
		it('returns null from empty storage', async () => {
			const storage = create();

			expect(await storage.getRunInProgress()).toBeNull();
		});

		it('returns a copy, so changing it leaves the saved run in progress unchanged', async () => {
			const storage = create();
			await storage.saveRunInProgress(savedRunInProgress);
			const read = await storage.getRunInProgress();
			if (read === null) {
				throw new Error('The run in progress should have been saved.');
			}
			read.heartbeatAt = '2026-11-19T11:00:00.000Z';

			expect(await storage.getRunInProgress()).toEqual(savedRunInProgress);
		});
	});

	describe('clearRunInProgress', () => {
		it('forgets the run in progress, and keeps its run and work periods', async () => {
			const storage = create();
			await storage.saveRunInProgress(savedRunInProgress, {
				run: runInProgress,
				workPeriods: [firstWorkPeriod]
			});

			await storage.clearRunInProgress();

			expect(await storage.getRunInProgress()).toBeNull();
			expect(await storage.getRuns()).toEqual([runInProgress]);
			expect(await storage.getWorkPeriods()).toEqual([firstWorkPeriod]);
		});

		it('does nothing when no run in progress is saved', async () => {
			const storage = create();

			await storage.clearRunInProgress();

			expect(await storage.getRunInProgress()).toBeNull();
		});
	});

	describe('getRuns', () => {
		it('returns nothing from empty storage', async () => {
			const storage = create();

			expect(await storage.getRuns()).toEqual([]);
		});

		it('returns the runs in the order they started, whatever order they were saved in', async () => {
			const storage = create();
			await storage.saveRunInProgress(savedRunInProgress, {
				run: runWith({ id: 'afternoon', startedAt: '2026-11-19T14:00:00.000Z' }),
				workPeriods: []
			});
			await storage.saveRunInProgress(savedRunInProgress, {
				run: runWith({ id: 'morning', startedAt: '2026-11-19T09:00:00.000Z' }),
				workPeriods: []
			});

			const runs = await storage.getRuns();

			expect(runs.map((run) => run.id)).toEqual(['morning', 'afternoon']);
		});

		it('returns copies, so changing one leaves the saved run unchanged', async () => {
			const storage = create();
			await storage.saveRunInProgress(savedRunInProgress, { run: runInProgress, workPeriods: [] });
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
			await storage.saveRunInProgress(savedRunInProgress, {
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
			await storage.saveRunInProgress(savedRunInProgress, {
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

			await storage.saveRunInProgress(savedRunInProgress, { run: runInProgress, workPeriods: [] });

			expect(await storage.hasWorkPeriods()).toBe(false);
		});

		it('says yes once a work period is saved', async () => {
			const storage = create();

			await storage.saveRunInProgress(savedRunInProgress, {
				run: runInProgress,
				workPeriods: [firstWorkPeriod]
			});

			expect(await storage.hasWorkPeriods()).toBe(true);
		});
	});
});
