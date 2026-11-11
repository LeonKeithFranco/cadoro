// The timer screen's state: the routines to pick from, the chosen routine and its run. It lives
// in a module rather than in the Timer page, which SvelteKit removes when another screen opens,
// so the run is still there on the way back.

import { createStarterRoutines, type Routine } from './routine';
import { createRun, finish, next, pause, play, viewRun, type RunState, type RunView } from './run';

/** A button's effect on a run, such as `play`, from the run engine. */
type Press = (run: RunState, now: number) => RunState;

/**
 * The routine picker and the run of the chosen routine, as reactive state the timer screen
 * shows.
 *
 * @remarks
 * The run logic stays in the pure engine in `run.ts`. This class only keeps its result in state
 * and reads the clock, so each button's change shows on screen at once. Its state is private and
 * only its methods change it, so the screen can't put a run into a state the engine didn't make.
 */
export class TimerSession {
	/** The routines to pick from, in the picker's order. */
	readonly routines: readonly Routine[];

	/** Returns the current moment, in milliseconds since 1970 (UTC), such as `Date.now`. */
	readonly #clock: () => number;

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
	 * one, since the app starts with its starter routines.
	 * @param clock - Returns the current moment, in milliseconds since 1970 (UTC). Tests pass a
	 * fake clock they move by hand.
	 * @throws {@link Error} If there are no routines to pick from.
	 */
	constructor(routines: readonly Routine[], clock: () => number) {
		const [firstRoutine] = routines;
		if (firstRoutine === undefined) {
			throw new Error('A timer session needs at least one routine.');
		}

		this.routines = routines;
		this.#clock = clock;
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
	 * Presses Finish: ends the run, and readies a new run of the same routine.
	 *
	 * @remarks
	 * The run summary doesn't exist yet, so the ended run isn't kept, and the screen goes straight
	 * back to ready.
	 */
	finish(): void {
		this.#press(finish);
		this.#run = createRun(this.#routine);
	}

	/** Moves the view on to the current moment, as the screen does every second while running. */
	tick(): void {
		this.#now = this.#clock();
	}

	/**
	 * Applies a button to the run at the current moment.
	 *
	 * @remarks
	 * The clock is read first, so the view is up to date as soon as the button changes the run,
	 * rather than at the next tick.
	 *
	 * @param press - The button's effect on the run, from the engine.
	 */
	#press(press: Press): void {
		this.tick();
		this.#run = press(this.#run, this.#now);
	}
}

/**
 * The routines to pick from: the starter routines, made afresh each time the app loads, until
 * routines are saved.
 *
 * @remarks
 * `crypto.randomUUID` is wrapped rather than passed as it is, because called on its own, away from
 * `crypto`, it throws "Illegal invocation" in browsers.
 */
// Made outside the exported session, where the `Date` is plainly only read. Svelte's lint rule
// `prefer-svelte-reactivity` assumes any `Date` built inside an export could be changed by
// whoever imports it.
const starterRoutines = createStarterRoutines(new Date(), () => crypto.randomUUID());

/**
 * The app's one timer session, which every visit to the Timer screen shares.
 *
 * @remarks
 * A module-level value is shared by everyone who loads the module. On a server, that would mean
 * every visitor, but this app renders only in the browser, so each one is a single person's.
 */
export const timerSession = new TimerSession(starterRoutines, () => Date.now());
