import { describe, expect, it } from 'vitest';
import { InMemoryStorage } from '#lib/storage/in-memory-storage.ts';
import { oneRoundRoutine, routineWith } from '#lib/testing/routines.ts';
import { savedRunInProgress } from '#lib/testing/run-in-progress.ts';
import { runWith, workPeriodWith } from '#lib/testing/run-records.ts';
import { storageHolding } from '#lib/testing/storage.ts';
import { load } from './+page';

/**
 * Runs the Stats page's `load` against a storage, as SvelteKit does once the layout has opened it.
 *
 * @param storage - The storage the layout's `load` would have returned.
 * @returns What the page receives as its data.
 */
async function loadStats(storage: InMemoryStorage): Promise<{
	routines: { id: string }[];
	workPeriods: { routineId: string }[];
	runInProgress: { revision: string } | null;
}> {
	// `load` only uses `parent`, so the rest of SvelteKit's event is left out.
	const event = { parent: async () => ({ storage }) } as unknown as Parameters<typeof load>[0];
	return (await load(event)) as Awaited<ReturnType<typeof loadStats>>;
}

describe('the Stats page load', () => {
	it('returns a deleted routine with the work saved for it', async () => {
		const storage = new InMemoryStorage();
		await storage.addRoutinesIfNone([
			routineWith({ id: 'focus', title: 'Focus' }),
			routineWith({ id: 'old', title: 'Old routine' })
		]);
		await storage.saveRunInProgress(savedRunInProgress, null, {
			run: runWith({ id: 'run-old', routineId: 'old' }),
			workPeriods: [workPeriodWith({ id: 'period-old', runId: 'run-old', routineId: 'old' })]
		});
		await storage.deleteRoutine('old');

		const data = await loadStats(storage);

		expect(data.routines.map((routine) => routine.id)).toEqual(['focus', 'old']);
		expect(data.workPeriods.map((period) => period.routineId)).toEqual(['old']);
	});

	it('returns the run in progress, so its work so far can count', async () => {
		const storage = storageHolding([oneRoundRoutine]);
		await storage.saveRunInProgress(savedRunInProgress, null, {
			run: runWith({ id: 'run-1' }),
			workPeriods: []
		});

		const data = await loadStats(storage);

		expect(data.runInProgress?.revision).toBe(savedRunInProgress.revision);
	});

	it('returns no run in progress when none is saved', async () => {
		const data = await loadStats(new InMemoryStorage());

		expect(data.runInProgress).toBeNull();
	});
});
