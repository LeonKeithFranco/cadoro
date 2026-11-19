// The timer screen's state: the routines to pick from, the chosen routine and its run, whose
// records it saves. The root
// layout's `load` makes the app's one session and keeps it in the layout's data, rather than the
// Timer page making it, since SvelteKit removes the page when another screen opens, and the run
// must still be there on the way back.

import type { Routine } from './routine';
import { createRun, finish, next, pause, play, viewRun, type RunState, type RunView } from './run';
import { recordPress, type Run, type RunRecords } from './run-records';
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
	/** Where each run and work period is saved. */
	storage: CadoroStorage;
	/** Returns a new unique id each time it's called, such as `crypto.randomUUID`. */
	newId: () => string;
};

/**
 * The routine picker and the run of the chosen routine, as reactive state the timer screen
 * shows, with each run and work period saved as it starts and ends.
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

	/** Where each run and work period is saved. */
	readonly #storage: CadoroStorage;

	/** Returns a new unique id each time it's called. */
	readonly #newId: () => string;

	/**
	 * The record of the latest run Play started, or `null` before the first. It isn't state,
	 * since nothing on screen shows it.
	 */
	#record: Run | null = null;

	/** The last save handed to storage, which the next save waits for. */
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
	 * Starts a session with the first routine chosen and its run ready.
	 *
	 * @param routines - The routines to pick from, in the picker's order. There's always at least
	 * one, since the first launch creates the starter routines, and routines can't be deleted
	 * yet.
	 * @param options - The clock, the storage runs are saved in and the id generator, as
	 * {@link TimerSessionOptions} describes them.
	 * @throws {@link Error} If there are no routines to pick from.
	 */
	constructor(routines: readonly Routine[], { clock, storage, newId }: TimerSessionOptions) {
		const [firstRoutine] = routines;
		if (firstRoutine === undefined) {
			throw new Error('A timer session needs at least one routine.');
		}

		this.routines = routines;
		this.#clock = clock;
		this.#storage = storage;
		this.#newId = newId;
		this.#routine = $state.raw(firstRoutine);
		this.#run = $state.raw(createRun(firstRoutine));
		this.#now = $state(clock());
		// Set after the state it reads, which a field's initializer would read before the
		// constructor had set it.
		this.view = $derived(viewRun(this.#run, this.#now));
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
	 * A run that hasn't ended is left as it is, so its work can't be thrown away by mistake.
	 */
	readyNewRun(): void {
		if (this.#run.status !== 'ended') {
			return;
		}

		this.#run = createRun(this.#routine);
	}

	/** Moves the view on to the current moment, as the screen does every second while running. */
	tick(): void {
		this.#now = this.#clock();
	}

	/**
	 * Applies a button to the run at the current moment, and saves what it started or ended.
	 *
	 * @remarks
	 * The clock is read first, so the view is up to date as soon as the button changes the run,
	 * rather than at the next tick.
	 *
	 * @param press - The button's effect on the run, from the engine.
	 */
	#press(press: Press): void {
		this.tick();
		const before = this.#run;
		this.#run = press(before, this.#now);

		const records = recordPress(
			{
				before,
				after: this.#run,
				now: this.#now,
				routineId: this.#routine.id,
				record: this.#record
			},
			this.#newId
		);
		this.#record = records.run ?? this.#record;
		this.#save(records);
	}

	/**
	 * Hands records to storage once every earlier save has finished, without waiting for it.
	 *
	 * @remarks
	 * Buttons change the screen at once and storage catches up, so a slow save never holds up
	 * the timer. Each save waits for the one before, so saves reach storage in the order the
	 * buttons were pressed whatever the backend, and a run's start is never saved after its end.
	 * A failed save is logged and the next one still runs, until milestone 8's activity log
	 * records errors.
	 *
	 * @param records - What a press left to save. Nothing is handed to storage when it's empty.
	 */
	#save(records: RunRecords): void {
		const hasRecords = records.run !== null || records.workPeriods.length > 0;
		if (!hasRecords) {
			return;
		}

		this.#saving = this.#saving
			.then(() => this.#storage.saveRunRecords(records))
			.catch((error: unknown) => {
				console.error('The run could not be saved.', error);
			});
	}
}
