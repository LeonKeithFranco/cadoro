// The timer screen's state: the routines to pick from, the chosen routine and its run, which it
// saves as it goes and restores when the app opens. The root layout's `load` makes the app's one
// session and keeps it in the layout's data, rather than the Timer page making it, since
// SvelteKit removes the page when another screen opens, and the run must still be there on the
// way back.

import type { Routine } from './routine';
import { createRun, finish, next, pause, play, viewRun, type RunState, type RunView } from './run';
import {
	restoreRunInProgress,
	toStoredRunInProgress,
	type StoredRunInProgress
} from './run-in-progress';
import { noRecords, recordPress, type Run, type RunRecords } from './run-records';
import type { CadoroStorage } from './storage/storage';

/** A button's effect on a run, such as `play`, from the run engine. */
type Press = (run: RunState, now: number) => RunState;

/** What a timer session needs from the rest of the app, passed in so tests can control it. */
export type TimerSessionOptions = {
	/**
	 * Returns the current moment, in milliseconds since 1970 (UTC), such as `Date.now`. Tests pass
	 * a fake clock they move by hand.
	 */
	clock: () => number;
	/** Where the run in progress, and each run and work period, is saved. */
	storage: CadoroStorage;
	/** Returns a new unique id each time it's called, such as `crypto.randomUUID`. */
	newId: () => string;
	/**
	 * Called each time a save that held work periods has finished, which the app uses to ask
	 * for persistent storage. It isn't waited for.
	 */
	onWorkSaved: () => void;
};

/**
 * The routine picker and the run of the chosen routine, as reactive state the timer screen
 * shows, with the run saved whenever a button changes it, and each run and work period saved as
 * it starts and ends.
 *
 * @remarks
 * The run logic stays in the pure engine in `run.ts`, and what to save in `run-records.ts`. This
 * class only keeps their results in state, reads the clock and hands the records to storage, so
 * each button's change shows on screen at once. Its state is private and only its methods change
 * it, so the screen can't put a run into a state the engine didn't make.
 */
export class TimerSession {
	/** The routines to pick from, in the picker's order. */
	readonly routines: readonly Routine[];

	/** Returns the current moment, in milliseconds since 1970 (UTC), such as `Date.now`. */
	readonly #clock: () => number;

	/** Where the run in progress, and each run and work period, is saved. */
	readonly #storage: CadoroStorage;

	/** Returns a new unique id each time it's called. */
	readonly #newId: () => string;

	/** Called each time a save that held work periods has finished. */
	readonly #onWorkSaved: () => void;

	/**
	 * The record of the latest run Play started, or of the run restored, or `null` before
	 * either. It isn't state, since nothing on screen shows it.
	 */
	#record: Run | null;

	/** The last write handed to storage, which the next write waits for. */
	#saving: Promise<void> = Promise.resolve();

	/** The routine chosen in the picker. */
	#routine: Routine;

	/** The chosen routine's run. Runs are immutable values that the engine replaces whole. */
	#run: RunState;

	/** The moment the view was last worked out for, in milliseconds since 1970 (UTC). */
	#now: number;

	/** Everything the timer screen shows about the run, as of the last button or tick. */
	readonly view: RunView;

	/**
	 * Starts a session that carries on the saved run in progress, or, when there's none, has the
	 * first routine chosen and its run ready.
	 *
	 * @remarks
	 * A saved run comes back paused at its last heartbeat, as `restoreRunInProgress` explains,
	 * and is saved again as it now is, so storage shows what the screen does. A saved run whose
	 * routine is gone is forgotten, and the session starts as if there were none.
	 *
	 * @param routines - The routines to pick from, in the picker's order. There's always at least
	 * one, since the first launch creates the starter routines, and routines can't be deleted
	 * yet.
	 * @param options - The clock, the storage runs are saved in, the id generator and what to do
	 * once work is saved, as {@link TimerSessionOptions} describes them.
	 * @param saved - The run in progress that storage held when the app opened, or `null` when it
	 * held none.
	 * @throws {@link Error} If there are no routines to pick from.
	 */
	constructor(
		routines: readonly Routine[],
		{ clock, storage, newId, onWorkSaved }: TimerSessionOptions,
		saved: StoredRunInProgress | null = null
	) {
		const [firstRoutine] = routines;
		if (firstRoutine === undefined) {
			throw new Error('A timer session needs at least one routine.');
		}

		this.routines = routines;
		this.#clock = clock;
		this.#storage = storage;
		this.#newId = newId;
		this.#onWorkSaved = onWorkSaved;

		const restored = saved === null ? null : restoreRunInProgress(saved, routines);
		const routine = restored?.routine ?? firstRoutine;
		this.#record = restored?.record ?? null;
		this.#routine = $state.raw(routine);
		this.#run = $state.raw(restored?.run ?? createRun(routine));
		this.#now = $state(clock());
		// Set after the state it reads, which a field's initializer would read before the
		// constructor had set it.
		this.view = $derived(viewRun(this.#run, this.#now));

		if (restored !== null) {
			this.#save(noRecords());
		} else if (saved !== null) {
			this.#forgetRunInProgress();
		}
	}

	/** The routine chosen in the picker. */
	get routine(): Routine {
		return this.#routine;
	}

	/**
	 * Chooses the routine to run, and readies its run.
	 *
	 * @remarks
	 * The routine can't change while a run is in progress, so the run's work isn't thrown away
	 * by mistake. An id that matches no routine changes nothing.
	 *
	 * @param id - The id of the routine to choose.
	 */
	select(id: string): void {
		const routine = this.routines.find((candidate) => candidate.id === id);
		if (routine === undefined || this.view.isInProgress) {
			return;
		}

		this.#routine = routine;
		this.#run = createRun(routine);
	}

	/** Presses Play: starts or resumes the run, or starts the next work period after a break. */
	play(): void {
		this.#press(play);
	}

	/** Presses Pause: stops the work period's or break's timer. */
	pause(): void {
		this.#press(pause);
	}

	/** Presses Next: ends the work period and starts its break, or ends the break early. */
	next(): void {
		this.#press(next);
	}

	/**
	 * Presses Finish: ends the run, saving the work period in progress up to this moment.
	 *
	 * @remarks
	 * The ended run is kept, so the screen can show its summary, until {@link TimerSession.readyNewRun}
	 * replaces it.
	 */
	finish(): void {
		this.#press(finish);
	}

	/**
	 * Readies a new run of the same routine once the run has ended, as closing its summary does.
	 *
	 * @remarks
	 * A run that hasn't ended is left as it is, so its work can't be thrown away by mistake. The
	 * ended run is kept as the run in progress until now, so its summary comes back after a
	 * reload, and is forgotten here, while its run and work periods stay saved.
	 */
	readyNewRun(): void {
		if (this.#run.status !== 'ended') {
			return;
		}

		this.#run = createRun(this.#routine);
		this.#forgetRunInProgress();
	}

	/**
	 * Moves the view on to the current moment, as the screen does every second while running,
	 * and saves the run's heartbeat while a timer is counting.
	 *
	 * @remarks
	 * The heartbeat is the moment a restored run is paused at, so the screen also calls this as
	 * the page is hidden, in case the app is stopped before the next tick. A paused run has
	 * nothing new to save.
	 */
	tick(): void {
		this.#moveOn();
		if (this.view.isRunning) {
			this.#save(noRecords());
		}
	}

	/** Moves the view on to the current moment, without saving anything. */
	#moveOn(): void {
		this.#now = this.#clock();
	}

	/**
	 * Applies a button to the run at the current moment, and saves the run with what it started
	 * or ended.
	 *
	 * @remarks
	 * The clock is read first, so the view is up to date as soon as the button changes the run,
	 * rather than at the next tick. A button that does nothing, such as Pause on a ready run,
	 * leaves the run as it was, so nothing is saved.
	 *
	 * @param press - The button's effect on the run, from the engine.
	 */
	#press(press: Press): void {
		this.#moveOn();
		const before = this.#run;
		const after = press(before, this.#now);
		if (after === before) {
			return;
		}
		this.#run = after;

		const records = recordPress(
			{ before, after, now: this.#now, routineId: this.#routine.id, record: this.#record },
			this.#newId
		);
		this.#record = records.run ?? this.#record;
		this.#save(records);
	}

	/**
	 * Saves the run in progress as of the current moment, with what a change left to keep.
	 *
	 * @remarks
	 * Once a save that held work periods has finished, `onWorkSaved` is called.
	 *
	 * @param records - What the change left to keep, besides the run in progress. A ready run
	 * isn't saved, since nothing has happened yet that's worth keeping.
	 */
	#save(records: RunRecords): void {
		const run = this.#run;
		const record = this.#record;
		// A run Play has started always has its record, so this only skips a ready run.
		if (run.status === 'ready' || record === null) {
			return;
		}

		const runInProgress = toStoredRunInProgress(record, run, this.#now);
		const hasWorkPeriods = records.workPeriods.length > 0;
		this.#enqueue(async () => {
			await this.#storage.saveRunInProgress(runInProgress, records);
			if (hasWorkPeriods) {
				this.#onWorkSaved();
			}
		});
	}

	/** Forgets the saved run in progress, once every earlier save has finished. */
	#forgetRunInProgress(): void {
		this.#enqueue(() => this.#storage.clearRunInProgress());
	}

	/**
	 * Hands a write to storage once every earlier write has finished, without waiting for it.
	 *
	 * @remarks
	 * Buttons change the screen at once and storage catches up, so a slow write never holds up
	 * the timer. Each write waits for the one before, so writes reach storage in the order they
	 * were made whatever the backend: a run's start is never saved after its end, and a late
	 * heartbeat can't bring back a run that Done has forgotten. A failed write is logged and the
	 * next one still runs, until milestone 8's activity log records errors.
	 *
	 * @param write - The write, which starts only when it's called.
	 */
	#enqueue(write: () => Promise<void>): void {
		this.#saving = this.#saving.then(write).catch((error: unknown) => {
			console.error('The run could not be saved.', error);
		});
	}
}
