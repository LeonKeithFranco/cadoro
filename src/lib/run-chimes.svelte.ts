// Sounds the run's chimes, in one tab of the app only. It follows the timer session's run and the
// chosen chimes and volume, and has the chime player reschedule whenever the run changes, which a
// press, a restore or another tab's change does, but a tick never does. With several tabs open,
// only the tab holding the `cadoro-chimes` Web Lock sounds, so each chime plays once.

import { ChimePlayer, type ChimeAudioContext, type ScheduledChime } from './chime-player';
import { chimeFile, chimeFilesFor, type ChimeFile } from './chimes';
import { recordError } from './error-log';
import { percentOf } from './percent';
import type { RunState } from './run';
import type { Settings } from './settings';

/**
 * The name of the lock the tab that sounds the chimes holds. A tab on an older version must take
 * turns with a newer one, so it never changes.
 */
export const CHIME_LOCK = 'cadoro-chimes';

/** The gain that plays the chimes as recorded, which a volume of 100 stands for. */
const FULL_GAIN = 1;

/** What {@link RunChimes} follows and needs, passed in so tests can control it. */
export type RunChimesOptions = {
	/** The timer session, whose `run` the chimes are scheduled from. */
	readonly timer: { readonly run: RunState };
	/** The settings session, whose chimes and volume are played. */
	readonly settings: { readonly settings: Settings };
	/**
	 * Returns the current moment, in milliseconds since 1970 (UTC), such as `Date.now`. It's read
	 * as each reschedule starts, the same moment the player reads the audio clock, and the player
	 * reads it again to place a chime anew when the audio clock may have stopped.
	 */
	readonly clock: () => number;
	/**
	 * The browser's lock manager, `navigator.locks`, or `undefined` where there's none, as
	 * outside HTTPS and `localhost`.
	 */
	readonly locks: LockManager | undefined;
	/**
	 * Turns a chime's file into the address the page fetches it from, such as SvelteKit's
	 * `asset`, which puts the base path in front.
	 */
	readonly address: (file: ChimeFile) => string;
	/**
	 * The lock's name, {@link CHIME_LOCK} unless given. Tests give each test a name of its own,
	 * since a lock lasts as long as the page.
	 */
	readonly lockName?: string;
	/** Makes the audio context. The browser's `AudioContext` unless given. */
	readonly createContext?: () => ChimeAudioContext;
	/** Fetches a chime file. The browser's `fetch` unless given. */
	readonly fetchFile?: (url: string) => Promise<Response>;
};

/**
 * Plays the run's chimes on time, in one tab of the app.
 *
 * @remarks
 * Browsers start audio only during a user gesture, so nothing sounds until {@link RunChimes.unlock}
 * is called from one, which the app does on every button press. Only once its audio plays does
 * the tab ask for its turn to sound, with an exclusive Web Lock. So the tab that sounds is always
 * one whose audio was unlocked, and a tab no button was pressed in, such as one that joined a live
 * run, or whose audio can't be made, never takes the turn from one that can play. The first tab
 * unlocked holds the turn until it closes, or until an unlock finds its audio can't resume, and
 * the browser then hands it to the next unlocked tab in the lock's queue, which schedules the
 * run's next chime as the run is then.
 *
 * Without the Web Locks API, or if the browser refuses the lock, the tabs can't take turns, so
 * every unlocked tab sounds, since a chime played twice is better than one not played. A refusal
 * is logged.
 *
 * The run is only read when it changes, and each chime is scheduled ahead on the audio clock, so
 * a background tab's slowed timers never make a chime late. The audio clock can stand still while
 * time goes on, as while a laptop sleeps, so the chime is also placed again from the wall clock as
 * the page shows again, besides when the player sees the audio run again, as
 * {@link ChimePlayer} explains.
 */
export class RunChimes {
	/** Plays the chimes, scheduling each on the audio clock. */
	readonly #player: ChimePlayer;

	/** The browser's lock manager, or `undefined` where there's none. */
	readonly #locks: LockManager | undefined;

	/** The name of the lock the sounding tab holds. */
	readonly #lockName: string;

	/** Turns a chime's file into the address the page fetches it from. */
	readonly #address: (file: ChimeFile) => string;

	/** Whether this tab has its turn to sound the chimes. State, so gaining it schedules the next chime. */
	#isSounding = $state(false);

	/**
	 * Gives up this tab's turn, whether it's waiting in the lock's queue or holding the lock, or
	 * `null` when the tab hasn't asked for one, or gave it up.
	 */
	#giveUpTurn: (() => void) | null = null;

	/**
	 * Starts following the run and the settings, silent until {@link RunChimes.unlock} is called.
	 *
	 * @param options - The timer and settings sessions to follow, the clock, the lock manager,
	 * how a chime's file is addressed, and the lock's name, the audio context and the fetch tests
	 * replace, as {@link RunChimesOptions} describes them.
	 */
	constructor({
		timer,
		settings,
		clock,
		locks,
		address,
		lockName = CHIME_LOCK,
		createContext,
		fetchFile
	}: RunChimesOptions) {
		this.#locks = locks;
		this.#lockName = lockName;
		this.#address = address;
		const initial = settings.settings;
		this.#player = new ChimePlayer({
			files: chimeFilesFor(initial, address),
			volume: gainFor(initial.volume),
			createContext,
			fetchFile,
			clock
		});

		// The root keeps the effects running outside any component, for as long as the app is open.
		$effect.root(() => {
			// Each setting is derived on its own, so changing another setting, such as the theme,
			// doesn't reschedule the chime.
			const volume = $derived(settings.settings.volume);
			const targetChime = $derived(settings.settings.targetChime);
			const breakChime = $derived(settings.settings.breakChime);

			// The gain applies to the chime already scheduled too, so the volume needs no reschedule.
			$effect(() => {
				this.#player.setVolume(gainFor(volume));
			});

			$effect(() => {
				this.#player.setFiles(chimeFilesFor({ targetChime, breakChime }, address));
				const run = timer.run;
				if (this.#isSounding) {
					void this.#player.reschedule(run, clock());
				}
			});
		});

		// The audio clock may have stood still while the page was out of sight, such as while a
		// laptop slept, so the chime is placed again from the wall clock once it shows. A tab that
		// isn't sounding has nothing placed, so the player does nothing there.
		document.addEventListener('visibilitychange', () => {
			if (document.visibilityState === 'visible') {
				void this.#player.catchUp();
			}
		});
	}

	/** Whether this tab has its turn to sound the chimes, so no other tab does. */
	get isSounding(): boolean {
		return this.#isSounding;
	}

	/**
	 * Lists the chimes this tab has scheduled, whether still to play or already playing.
	 *
	 * @returns The chimes scheduled since the run last changed, empty in a tab that isn't sounding.
	 */
	get scheduled(): readonly ScheduledChime[] {
		return this.#player.scheduled;
	}

	/**
	 * Lets this tab play the chimes, and once its audio plays, asks for its turn to sound them,
	 * unless it already has.
	 *
	 * @remarks
	 * Call it from a user gesture, such as a button press, since browsers allow audio to start only
	 * then. Every call resumes the audio, which a phone can suspend, such as for a call. A tab
	 * whose audio can't be made or resumed doesn't ask, and gives up a turn it has, cancelling its
	 * chime, so it never keeps the turn from a tab that can play. It asks again once a later unlock
	 * succeeds.
	 */
	unlock(): void {
		void this.#unlockAndTakeTurn();
	}

	/**
	 * Unlocks the audio, then asks for this tab's turn if it plays, or gives the turn up if not.
	 *
	 * @returns A promise that settles once the turn is asked for or given up. It never rejects.
	 */
	async #unlockAndTakeTurn(): Promise<void> {
		const canPlay = await this.#player.unlock();
		if (canPlay) {
			this.#askForTurn();
		} else {
			this.#letTurnGo();
		}
	}

	/** Asks for this tab's turn to sound the chimes, unless it's waiting for one or has it. */
	#askForTurn(): void {
		if (this.#giveUpTurn !== null) {
			return;
		}
		const abandon = new AbortController();
		const { promise: givenUp, resolve: giveUp } = Promise.withResolvers<void>();
		this.#giveUpTurn = (): void => {
			abandon.abort();
			giveUp();
		};
		void this.#waitForTurnToSound(abandon.signal, givenUp);
	}

	/** Gives up this tab's turn, waiting or held, and cancels its chime, so the next tab sounds. */
	#letTurnGo(): void {
		if (this.#giveUpTurn === null) {
			return;
		}
		this.#giveUpTurn();
		this.#giveUpTurn = null;
		this.#isSounding = false;
		this.#player.cancel();
	}

	/**
	 * Checks that the scheduled chime is still in place, and places it again from the wall clock
	 * if the audio clock fell behind, or drops it if its moment has passed.
	 *
	 * @remarks
	 * The app calls it on every tick, as an extra check beside the audio clock's own scheduling:
	 * after a laptop sleeps, a background tab may hear neither the audio running again nor the
	 * page showing, and its first tick after waking comes before the late chime would play. A
	 * chime in place is left alone, so a tick never reschedules it. A tab that isn't sounding has
	 * nothing placed, so it does nothing.
	 *
	 * @returns A promise that settles once the chime is in place, or dropped. It never rejects.
	 */
	catchUp(): Promise<void> {
		return this.#player.catchUp();
	}

	/**
	 * Plays a chime at once, as Settings' Preview buttons do.
	 *
	 * @remarks
	 * Call it from a user gesture, since browsers allow audio to start only then. It plays in
	 * this tab whether or not the tab has its turn to sound the run's chimes, since the user is
	 * here asking to hear it, and it never takes that turn or changes what's scheduled.
	 *
	 * @param chime - The id of the chime, as Settings keeps it. An id the app doesn't have plays
	 * the default chime, as the run's chimes do.
	 * @returns A promise that settles once the chime has started, or can't. It never rejects.
	 */
	preview(chime: string): Promise<void> {
		return this.#player.preview(this.#address(chimeFile(chime)));
	}

	/**
	 * Waits for the lock that gives a tab its turn to sound, then holds it until the tab closes or
	 * gives the turn up.
	 *
	 * @param abandon - Aborted when the turn is given up, which takes the tab out of the queue if
	 * it's still waiting.
	 * @param givenUp - Settles when the turn is given up, which lets the lock go if it's held.
	 * @returns A promise that settles once the lock is let go, or at once without the Web Locks
	 * API, or once the browser refuses the lock, in which case this tab sounds anyway. It never
	 * rejects.
	 */
	async #waitForTurnToSound(abandon: AbortSignal, givenUp: Promise<void>): Promise<void> {
		if (this.#locks === undefined) {
			this.#isSounding = true;
			return;
		}
		try {
			// Exclusive by default, so one tab holds it and the rest wait in turn. The browser lets
			// it go when the tab closes, reloads or crashes.
			await this.#locks.request(this.#lockName, { signal: abandon }, async () => {
				this.#isSounding = true;
				await givenUp;
			});
		} catch (error: unknown) {
			// Leaving the queue rejects the request, which is no failure.
			if (abandon.aborted) {
				return;
			}
			void recordError(
				'Could not take turns with other tabs, so this tab sounds the chimes.',
				error
			);
			this.#isSounding = true;
		}
	}
}

/**
 * Turns the volume Settings keeps into the gain the player takes.
 *
 * @param volume - The volume, from 0 for silence to 100 for the chimes as recorded.
 * @returns The gain, from 0 to 1.
 */
function gainFor(volume: number): number {
	return percentOf(FULL_GAIN, volume);
}
