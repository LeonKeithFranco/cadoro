// The timer screen's state: the routines to pick from, the chosen routine and its run, which it
// saves as it goes, restores when the app opens, and follows as other tabs change it. The root
// layout's `load` makes the app's one session and keeps it in the layout's data, rather than the
// Timer page making it, since SvelteKit removes the page when another screen opens, and the run
// must still be there on the way back.

import type { Routine } from './routine';
import { createRun, finish, next, pause, play, viewRun, type RunState, type RunView } from './run';
import {
	followRunInProgress,
	restoreRunInProgress,
	toStoredRunInProgress,
	type RestoredRun,
	type StoredRunInProgress
} from './run-in-progress';
import { noRecords, recordPress, type Run, type RunRecords } from './run-records';
import type { CadoroStorage } from './storage/storage';
import { toUtcTimestamp } from './time';

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
	/** Returns a new unique id for a run or work period each time it's called. */
	newId: () => string;
	/**
	 * Returns a new unique id for a change to the run in progress each time it's called, as
	 * `StoredRunInProgress`'s `revision` explains. It's apart from `newId`, so tests can number
	 * the records without counting the changes. The app gives both `crypto.randomUUID`.
	 */
	newRevision: () => string;
	/**
	 * Called each time a save that held work periods has finished, which the app uses to ask
	 * for persistent storage. It isn't waited for.
	 */
	onWorkSaved: () => void;
};

/** What the app found as it opened, which a session carries on from. */
export type AppOpening = {
	/** The run in progress that storage held when the app opened, or `null` when it held none. */
	saved: StoredRunInProgress | null;
	/**
	 * Whether another tab of the app was open, so the saved run is still live there, rather than
	 * left when the app last closed.
	 */
	isAnotherTabOpen: boolean;
};

/**
 * The routine picker and the run of the chosen routine, as reactive state the timer screen
 * shows, with the run saved whenever a button changes it, and each run and work period saved as
 * it starts and ends. Every open tab has a session, and each follows the one saved run.
 *
 * @remarks
 * The run logic stays in the pure engine in `run.ts`, and what to save in `run-records.ts`. This
 * class only keeps their results in state, reads the clock and hands the records to storage, so
 * each button's change shows on screen at once. Its state is private and only its methods change
 * it, so the screen can't put a run into a state the engine didn't make.
 *
 * Each change is saved only if storage still holds the run in progress this session worked it out
 * from, and a session whose change is refused saves nothing and takes on the saved run instead.
 * So a tab that hasn't yet seen another tab's press can't overwrite it, and each work period is
 * saved once, by the tab whose press ended it. A change from another tab is taken on as it was
 * saved, without saving it again. Heartbeats change only the saved heartbeat, never the run.
 */
export class TimerSession {
	/** The routines to pick from, in the picker's order. */
	readonly routines: readonly Routine[];

	/** Returns the current moment, in milliseconds since 1970 (UTC), such as `Date.now`. */
	readonly #clock: () => number;

	/** Where the run in progress, and each run and work period, is saved. */
	readonly #storage: CadoroStorage;

	/** Returns a new unique id for a run or work period each time it's called. */
	readonly #newId: () => string;

	/** Returns a new unique id for a change to the run in progress each time it's called. */
	readonly #newRevision: () => string;

	/** Called each time a save that held work periods has finished. */
	readonly #onWorkSaved: () => void;

	/**
	 * The record of the run in progress, as Play started it, as restored or as taken on from
	 * another tab, or `null` while the run is ready. It isn't state, since nothing on screen shows
	 * it.
	 */
	#record: Run | null;

	/**
	 * The revision of the saved run in progress that this session's run is, once its writes have
	 * all been handed to storage: the one it last saved or took on, or `null` when there's none.
	 */
	#revision: string | null = null;

	/**
	 * The revisions whose save failed, each with the revision storage kept instead, so a later
	 * change worked out from a failed one is checked against what storage really holds, and the
	 * session carries on saving. A plain object rather than a `Map`, which Svelte's lint would
	 * have be a reactive `SvelteMap`, though nothing on screen shows it.
	 */
	readonly #failedRevisions: Record<string, string | null> = {};

	/** The last write handed to storage, which the next write waits for. */
	#saving: Promise<void> = Promise.resolve();

	/** How many writes have been handed to storage and not yet finished. */
	#pendingWrites = 0;

	/** How many writes have been handed to storage since the session started. */
	#writesHanded = 0;

	/**
	 * Whether storage may hold a change from another tab that this session hasn't taken on yet,
	 * reported while its own writes were still going, or shown by a refused write.
	 */
	#isBehind = false;

	/** How many times the session has read the saved run to catch up, so only the latest counts. */
	#catchUps = 0;

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
	 * first routine chosen and its run ready, and follows the saved run from then on.
	 *
	 * @remarks
	 * When no other tab is open, a saved run comes back paused at its last heartbeat, as
	 * `restoreRunInProgress` explains, and is saved again as it now is, so storage shows what the
	 * screen does. When another tab is open, the run is live there, so it's taken on exactly as
	 * saved, still running if it was, and nothing is saved. A saved run whose routine is gone is
	 * forgotten, and the session starts as if there were none.
	 *
	 * @param routines - The routines to pick from, in the picker's order. There's always at least
	 * one, since the first launch creates the starter routines, and routines can't be deleted
	 * yet.
	 * @param options - The clock, the storage runs are saved in, the id generators and what to do
	 * once work is saved, as {@link TimerSessionOptions} describes them.
	 * @param opening - The run in progress storage held as the app opened, and whether another tab
	 * was open. No run and no other tab when left out.
	 * @throws {@link Error} If there are no routines to pick from.
	 */
	constructor(
		routines: readonly Routine[],
		{ clock, storage, newId, newRevision, onWorkSaved }: TimerSessionOptions,
		{ saved, isAnotherTabOpen }: AppOpening = { saved: null, isAnotherTabOpen: false }
	) {
		const [firstRoutine] = routines;
		if (firstRoutine === undefined) {
			throw new Error('A timer session needs at least one routine.');
		}

		this.routines = routines;
		this.#clock = clock;
		this.#storage = storage;
		this.#newId = newId;
		this.#newRevision = newRevision;
		this.#onWorkSaved = onWorkSaved;

		const carriedOn = TimerSession.#carryOn(saved, routines, isAnotherTabOpen);
		const routine = carriedOn?.routine ?? firstRoutine;
		this.#record = carriedOn?.record ?? null;
		this.#routine = $state.raw(routine);
		this.#run = $state.raw(carriedOn?.run ?? createRun(routine));
		this.#now = $state(clock());
		// Set after the state it reads, which a field's initializer would read before the
		// constructor had set it.
		this.view = $derived(viewRun(this.#run, this.#now));

		if (saved !== null) {
			if (carriedOn === null) {
				this.#forgetRunInProgress(saved.revision);
			} else {
				this.#revision = saved.revision;
				if (!isAnotherTabOpen) {
					this.#save(noRecords());
				}
			}
		}

		storage.watchRunInProgress(
			(runInProgress) => {
				this.#noticeChange(runInProgress);
			},
			(error: unknown) => {
				console.error('Changes to the run from other tabs can no longer be followed.', error);
			}
		);
	}

	/**
	 * Works out the run a new session carries on from the run storage held as the app opened.
	 *
	 * @param saved - The run in progress storage held, or `null` when it held none.
	 * @param routines - The routines to pick from.
	 * @param isAnotherTabOpen - Whether another tab was open, so the run is live there.
	 * @returns The run taken on as saved when another tab is open, or else paused at its last
	 * heartbeat, or `null` when none is saved or its routine is gone.
	 */
	static #carryOn(
		saved: StoredRunInProgress | null,
		routines: readonly Routine[],
		isAnotherTabOpen: boolean
	): RestoredRun | null {
		if (saved === null) {
			return null;
		}
		return isAnotherTabOpen
			? followRunInProgress(saved, routines)
			: restoreRunInProgress(saved, routines);
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

		const revision = this.#revision;
		this.#run = createRun(this.#routine);
		this.#record = null;
		this.#revision = null;
		// An ended run is always saved, so it always has a revision.
		if (revision !== null) {
			this.#forgetRunInProgress(revision);
		}
	}

	/**
	 * Moves the view on to the current moment, as the screen does every second while running,
	 * and saves the run's heartbeat while a timer is counting.
	 *
	 * @remarks
	 * The heartbeat is the moment a restored run is paused at, so the screen also calls this as
	 * the page is hidden, in case the app is stopped before the next tick. A paused run has
	 * nothing new to save. Only the heartbeat is saved, never the run, so a tab that hasn't yet
	 * seen another tab's press can't undo it.
	 */
	tick(): void {
		this.#moveOn();
		const revision = this.#revision;
		if (!this.view.isRunning || revision === null) {
			return;
		}

		const heartbeatAt = toUtcTimestamp(this.#now);
		this.#enqueue(async () => {
			await this.#storage.saveHeartbeat(revision, heartbeatAt);
		});
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
	 * Saves the run in progress as of the current moment, with what a change left to keep, if
	 * storage still holds the run this change was worked out from.
	 *
	 * @remarks
	 * The change gets a new revision at once, so the next change is worked out from it, even
	 * before it's saved. Once a save that held work periods has finished, `onWorkSaved` is called.
	 * A refused save keeps nothing, and the session catches up with the run storage holds.
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

		const basedOn = this.#revision;
		const revision = this.#newRevision();
		this.#revision = revision;
		const runInProgress = toStoredRunInProgress(record, run, this.#now, revision);
		const hasWorkPeriods = records.workPeriods.length > 0;
		this.#enqueue(async () => {
			const savedBasis = this.#savedRevision(basedOn);
			try {
				const isSaved = await this.#storage.saveRunInProgress(runInProgress, savedBasis, records);
				if (!isSaved) {
					this.#isBehind = true;
				} else if (hasWorkPeriods) {
					this.#onWorkSaved();
				}
			} catch (error: unknown) {
				this.#failedRevisions[revision] = savedBasis;
				throw error;
			}
		});
	}

	/**
	 * Forgets the saved run in progress, once every earlier write has finished, if it's still the
	 * one this session forgot.
	 *
	 * @param basedOn - The revision of the run in progress to forget.
	 */
	#forgetRunInProgress(basedOn: string): void {
		this.#enqueue(async () => {
			const savedBasis = this.#savedRevision(basedOn);
			// A run whose saves all failed was never saved, so there's nothing to forget.
			if (savedBasis === null) {
				return;
			}
			const isCleared = await this.#storage.clearRunInProgress(savedBasis);
			if (!isCleared) {
				this.#isBehind = true;
			}
		});
	}

	/**
	 * Finds the revision storage holds for a run this session worked out, which differs only
	 * when the run's save failed.
	 *
	 * @param revision - The run's revision, or `null` for none.
	 * @returns The revision storage kept instead of a failed one, following failure after
	 * failure, or `revision` itself.
	 */
	#savedRevision(revision: string | null): string | null {
		if (revision === null || !Object.hasOwn(this.#failedRevisions, revision)) {
			return revision;
		}
		return this.#failedRevisions[revision] ?? null;
	}

	/**
	 * Hears that the saved run in progress has changed, and catches up with it unless it's the
	 * run this session already has.
	 *
	 * @param runInProgress - The run in progress storage reported.
	 */
	#noticeChange(runInProgress: StoredRunInProgress | null): void {
		const reported = runInProgress === null ? null : runInProgress.revision;
		if (reported !== this.#savedRevision(this.#revision)) {
			this.#catchUpWhenWritesFinish();
		}
	}

	/**
	 * Catches up with the saved run now, or, while this session's own writes are still going,
	 * once they've all finished, since the change may be one they're about to refuse or replace.
	 */
	#catchUpWhenWritesFinish(): void {
		if (this.#pendingWrites > 0) {
			this.#isBehind = true;
		} else {
			void this.#catchUp();
		}
	}

	/**
	 * Reads the run in progress storage holds and takes it on, unless this session has handed
	 * storage a write since the read started, or started a later read.
	 *
	 * @remarks
	 * It reads rather than taking on a reported change, since a report can arrive after a later
	 * save. A write handed over during the read was worked out from this session's own run, and
	 * the read may be older than it, so the read is dropped, and catching up starts again once the
	 * write has finished. Of two reads, only the later counts, whichever finishes last.
	 */
	async #catchUp(): Promise<void> {
		this.#catchUps += 1;
		const catchUp = this.#catchUps;
		const writesBefore = this.#writesHanded;
		let saved: StoredRunInProgress | null;
		try {
			saved = await this.#storage.getRunInProgress();
		} catch (error: unknown) {
			console.error('The run could not be read.', error);
			return;
		}

		if (catchUp !== this.#catchUps) {
			return;
		}
		if (writesBefore !== this.#writesHanded) {
			this.#catchUpWhenWritesFinish();
			return;
		}
		this.#follow(saved);
	}

	/**
	 * Takes on the saved run in progress as it is, as another tab saved it, without saving it
	 * again.
	 *
	 * @remarks
	 * A forgotten run, after another tab's Done, readies a new run of the same routine. A run
	 * whose routine this session doesn't have is left alone, which can't happen until routines
	 * can be deleted, in milestone 6.
	 *
	 * @param saved - The run in progress storage holds, or `null` when none is saved.
	 */
	#follow(saved: StoredRunInProgress | null): void {
		const revision = saved === null ? null : saved.revision;
		if (revision === this.#savedRevision(this.#revision)) {
			return;
		}

		if (saved === null) {
			this.#run = createRun(this.#routine);
			this.#record = null;
			this.#revision = null;
			return;
		}

		const followed = followRunInProgress(saved, this.routines);
		if (followed === null) {
			return;
		}
		this.#routine = followed.routine;
		this.#record = followed.record;
		this.#run = followed.run;
		this.#revision = saved.revision;
		this.#moveOn();
	}

	/**
	 * Hands a write to storage once every earlier write has finished, without waiting for it.
	 *
	 * @remarks
	 * Buttons change the screen at once and storage catches up, so a slow write never holds up
	 * the timer. Each write waits for the one before, so writes reach storage in the order they
	 * were made whatever the backend: a run's start is never saved after its end, and a late
	 * heartbeat can't bring back a run that Done has forgotten. A failed write is logged and the
	 * next one still runs, until milestone 8's activity log records errors. Once the last write has
	 * finished, the session catches up with any change it was told of meanwhile.
	 *
	 * @param write - The write, which starts only when it's called.
	 */
	#enqueue(write: () => Promise<void>): void {
		this.#writesHanded += 1;
		this.#pendingWrites += 1;
		this.#saving = this.#saving
			.then(write)
			.catch((error: unknown) => {
				console.error('The run could not be saved.', error);
			})
			.then(() => {
				this.#pendingWrites -= 1;
				if (this.#pendingWrites === 0 && this.#isBehind) {
					this.#isBehind = false;
					void this.#catchUp();
				}
			});
	}
}
