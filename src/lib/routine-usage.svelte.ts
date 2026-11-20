// Keeps the runs and work periods that "last used" and "most work" are worked out from, in one
// place, so the Timer's picker, the session's fallback routine and the Routines screen sort from
// the same fresh data.

import { recordError } from './error-log';
import { NO_USAGE, type RoutineUsage } from './routine-sort';
import type { CadoroStorage } from './storage/storage';

/**
 * Holds the routine usage, which the app reads again whenever it may have changed.
 *
 * @remarks
 * The usage is replaced whole, and only once a read succeeds, so a failed read keeps what was
 * known. Reads are numbered, and only the latest one started is kept, so a slow read can't bring
 * back older usage. The value is raw state, so a screen that reads it sorts again when it's replaced.
 */
export class RoutineUsageKeeper {
	/** Reads the runs and work periods. */
	readonly #storage: Pick<CadoroStorage, 'getRuns' | 'getWorkPeriods'>;

	/** The usage as last read, or as given at the start. */
	#usage = $state.raw<RoutineUsage>(NO_USAGE);

	/** How many reads have started, which numbers each one so only the latest is kept. */
	#reloadsStarted = 0;

	/**
	 * Starts with usage the app has already read.
	 *
	 * @param storage - What the runs and work periods are read from.
	 * @param usage - The usage read as the app opened.
	 */
	constructor(storage: Pick<CadoroStorage, 'getRuns' | 'getWorkPeriods'>, usage: RoutineUsage) {
		this.#storage = storage;
		this.#usage = usage;
	}

	/** Every run and work period saved, as last read. */
	get usage(): RoutineUsage {
		return this.#usage;
	}

	/**
	 * Reads the runs and work periods again, and keeps them.
	 *
	 * @returns A promise that settles once the read has finished. A failed read is recorded in the
	 * activity log and leaves the usage as it was. It never rejects.
	 */
	async reload(): Promise<void> {
		this.#reloadsStarted += 1;
		const thisReload = this.#reloadsStarted;
		try {
			const [runs, workPeriods] = await Promise.all([
				this.#storage.getRuns(),
				this.#storage.getWorkPeriods()
			]);
			// A read that finishes after a later one started holds older data, so it's dropped.
			if (thisReload === this.#reloadsStarted) {
				this.#usage = { runs, workPeriods };
			}
		} catch (error: unknown) {
			void recordError(
				'The runs could not be read, so "last used" and "most work" may be out of order.',
				error
			);
		}
	}
}
