import { afterEach, describe, expect, it } from 'vitest';
import { useErrorLog } from './error-log';
import { RoutineUsageKeeper } from './routine-usage.svelte';
import { InMemoryStorage } from './storage/in-memory-storage';
import type { CadoroStorage } from './storage/storage';
import { runInProgressWith } from './testing/run-in-progress';
import { firstWorkPeriod, runWith } from './testing/run-records';

// Takes away the log a test chose for errors.
afterEach(() => {
	useErrorLog(null);
});

describe('RoutineUsageKeeper', () => {
	it('starts with the usage it is given', () => {
		const first = runWith({ id: 'first' });

		const keeper = new RoutineUsageKeeper(new InMemoryStorage(), {
			runs: [first],
			workPeriods: []
		});

		expect(keeper.usage).toEqual({ runs: [first], workPeriods: [] });
	});

	it('reads the runs and work periods saved since, so everything sorting by usage sees one fresh copy', async () => {
		const storage = new InMemoryStorage();
		const keeper = new RoutineUsageKeeper(storage, { runs: [], workPeriods: [] });
		await storage.saveRunInProgress(runInProgressWith({}), null, {
			run: runWith({}),
			workPeriods: [firstWorkPeriod]
		});

		await keeper.reload();

		expect(keeper.usage).toEqual({ runs: [runWith({})], workPeriods: [firstWorkPeriod] });
	});

	it('keeps the usage it had when a read fails, and records the error', async () => {
		const failing: Pick<CadoroStorage, 'getRuns' | 'getWorkPeriods'> = {
			getRuns: () => Promise.reject(new Error('The disk is full.')),
			getWorkPeriods: () => Promise.resolve([])
		};
		const logged: string[] = [];
		useErrorLog({
			addLogEntry: (entry): Promise<void> => {
				logged.push(entry.message);
				return Promise.resolve();
			}
		});
		const before = { runs: [runWith({ id: 'old' })], workPeriods: [] };
		const keeper = new RoutineUsageKeeper(failing, before);

		await keeper.reload();

		expect(keeper.usage).toEqual(before);
		expect(logged).toHaveLength(1);
	});
});
