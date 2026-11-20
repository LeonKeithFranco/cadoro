// Plays a run's chimes through Web Audio. Each chime is scheduled ahead on the audio clock rather
// than started by a timer, because a background tab's timers are slowed down, while the audio
// clock keeps time. Browser-only: it needs `AudioContext`, which it's given so tests can fake it.

import { nextChime, type ChimeAlert, type DueChime } from './chime-schedule';
import { recordError } from './error-log';
import type { RunState } from './run';
import { MS_PER_SECOND } from './time';

/** A decoded chime, ready to play. The player only hands it from decoding to a source. */
export type ChimeSound = {
	/** How long the chime lasts, in seconds. */
	readonly duration: number;
};

/** Where an audio node can be connected to, such as the speakers or the volume's gain. */
export type ChimeOutput = object;

/** The volume control every chime plays through, as a `GainNode` is. */
export type ChimeGain = {
	/** The gain applied, whose `value` is 0 for silence and 1 for the chime as recorded. */
	readonly gain: { value: number };
	/**
	 * Sends the gain's output somewhere.
	 *
	 * @param destination - Where to send it, such as the speakers.
	 * @returns Whatever the node returns, which the player ignores.
	 */
	connect(destination: ChimeOutput): unknown;
};

/** One chime's playback, as an `AudioBufferSourceNode` is, which can be started only once. */
export type ChimeSource = {
	/** The chime it plays. */
	buffer: ChimeSound | null;
	/**
	 * Sends the source's output somewhere.
	 *
	 * @param destination - Where to send it, such as the volume's gain.
	 * @returns Whatever the node returns, which the player ignores.
	 */
	connect(destination: ChimeOutput): unknown;
	/**
	 * Schedules the chime to start.
	 *
	 * @param when - When to start, in seconds on the audio clock. A moment already passed starts
	 * it at once.
	 */
	start(when: number): void;
	/** Stops the chime, or keeps it from starting if its moment hasn't come. */
	stop(): void;
};

/**
 * The parts of an `AudioContext` the player uses, so tests can pass a fake one.
 *
 * @remarks
 * The browser's own `AudioContext` fits this type, which the default factory relies on.
 */
export type ChimeAudioContext = {
	/** The audio clock, in seconds since the context was made, which keeps time in the background. */
	readonly currentTime: number;
	/** The speakers. */
	readonly destination: ChimeOutput;
	/**
	 * Whether the audio clock runs: `running`, or another state, such as `suspended`, while it's
	 * stopped.
	 */
	readonly state: string;
	/**
	 * Listens for the state to change, as when the browser stops the audio clock while a laptop
	 * sleeps or for a phone call, and runs it again after.
	 *
	 * @param type - The event, `statechange`.
	 * @param listener - Called after each change of state.
	 */
	addEventListener(type: 'statechange', listener: () => void): void;
	/**
	 * Lets the context make sound, which browsers allow only after a user gesture.
	 *
	 * @returns A promise that settles once the context is running, or rejects if it can't run.
	 */
	resume(): Promise<void>;
	/**
	 * Decodes a sound file.
	 *
	 * @param data - The file's bytes.
	 * @returns A promise of the decoded sound, which rejects when the bytes aren't audio the
	 * browser can play.
	 */
	decodeAudioData(data: ArrayBuffer): Promise<ChimeSound>;
	/**
	 * Makes a volume control.
	 *
	 * @returns A gain node, at full volume.
	 */
	createGain(): ChimeGain;
	/**
	 * Makes a playback of one chime.
	 *
	 * @returns A source with no chime yet.
	 */
	createBufferSource(): ChimeSource;
};

/** The chime file each alert plays, as an address the page can fetch. */
export type ChimeFiles = Readonly<Record<ChimeAlert, string>>;

/** What a {@link ChimePlayer} starts with. */
export type ChimePlayerOptions = {
	/** The chime file each alert plays. */
	readonly files: ChimeFiles;
	/** The volume, as a gain from 0 for silence to 1 for the chimes as recorded. */
	readonly volume: number;
	/**
	 * Makes the audio context, once, on the first {@link ChimePlayer.unlock}. It may throw where
	 * Web Audio isn't available. Defaults to the browser's `AudioContext`.
	 */
	readonly createContext?: () => ChimeAudioContext;
	/** Fetches a chime file. Defaults to the browser's `fetch`. */
	readonly fetchFile?: (url: string) => Promise<Response>;
	/**
	 * Returns the current moment on the wall clock, in milliseconds since 1970 (UTC), which keeps
	 * going while the audio clock stops. Defaults to `Date.now`.
	 */
	readonly clock?: () => number;
};

/**
 * How long after its moment a chime may still start, in milliseconds, such as when its file was
 * slow to load. A chime any later is dropped, since a late chime would mark a moment that's gone.
 */
export const LATE_CHIME_TOLERANCE_MS = MS_PER_SECOND;

/**
 * How far a scheduled chime may be from its moment, in milliseconds, before catching up places it
 * again. The two clocks are read a moment apart, so a chime in place never measures exactly 0.
 */
const ALLOWED_DRIFT_MS = 100;

/** A chime the player has scheduled and not cancelled. */
export type ScheduledChime = DueChime & {
	/** When it starts, in seconds on the audio clock. */
	readonly startsAt: number;
	/** The file it plays. */
	readonly file: string;
};

/** A scheduled chime with the source playing it, so it can be cancelled. */
type ScheduledPlayback = ScheduledChime & {
	/** The source scheduled to play it. */
	readonly source: ChimeSource;
};

/** The audio context and the volume control every chime goes through. */
type AudioOutput = {
	/** The audio context. */
	readonly context: ChimeAudioContext;
	/** The gain every chime connects to, connected to the speakers. */
	readonly volume: ChimeGain;
};

/**
 * Plays a run's chimes on time, scheduling each on the audio clock.
 *
 * @remarks
 * Browsers start audio only after a user gesture, so {@link ChimePlayer.unlock} must be called
 * from one, such as the Play press. Until then nothing is scheduled. After any change to the run,
 * whether a press, a restore or another tab's change, {@link ChimePlayer.reschedule} cancels what
 * was scheduled and schedules the run's next chime instead. A chime file that can't be fetched or
 * decoded is logged, and the run carries on without its chime.
 *
 * The audio clock stops while a laptop sleeps, or a phone takes a call, while the wall clock goes
 * on, so a chime placed on the audio clock would play late by as long as it stood still. So the
 * player places the last run's chime again from the wall clock whenever the audio clock may have
 * stopped: when the context says it runs again, once an unlock has resumed it, and when
 * {@link ChimePlayer.catchUp} is called, as the page shows again. A chime whose moment has passed
 * by then is dropped, and none ever starts more than {@link LATE_CHIME_TOLERANCE_MS} late.
 */
export class ChimePlayer {
	/** The chime file each alert plays. */
	#files: ChimeFiles;
	/** The volume, as a gain from 0 to 1. */
	#volume: number;
	/** Makes the audio context. */
	readonly #createContext: () => ChimeAudioContext;
	/** Fetches a chime file. */
	readonly #fetchFile: (url: string) => Promise<Response>;
	/** Returns the current moment on the wall clock, in milliseconds since 1970 (UTC). */
	readonly #clock: () => number;
	/** The run the last reschedule placed the chime of, or `null` before any, or once cancelled. */
	#lastRun: RunState | null = null;
	/** The audio output, once unlocked, or `null` before. */
	#output: AudioOutput | null = null;
	/** Each file's decoded chime, loaded once, or `null` when it couldn't be loaded. */
	readonly #sounds = new Map<string, Promise<ChimeSound | null>>();
	/** The chimes scheduled since the last reschedule. */
	#scheduled: ScheduledPlayback[] = [];
	/** Counts reschedules, so one still loading its chime can tell that a later one replaced it. */
	#rescheduleCount = 0;

	/**
	 * Makes a player, which stays silent until it's unlocked.
	 *
	 * @param options - The chime files, the volume, and optionally the audio context's factory,
	 * the fetch and the wall clock, which tests replace.
	 */
	constructor(options: ChimePlayerOptions) {
		this.#files = options.files;
		this.#volume = clampVolume(options.volume);
		this.#createContext = options.createContext ?? ((): ChimeAudioContext => new AudioContext());
		this.#fetchFile = options.fetchFile ?? ((url: string): Promise<Response> => fetch(url));
		this.#clock = options.clock ?? ((): number => Date.now());
	}

	/**
	 * Lists the chimes scheduled by the last reschedule, whether still to play or already playing.
	 *
	 * @returns The scheduled chimes, with their alert, moment, start on the audio clock and file.
	 */
	get scheduled(): readonly ScheduledChime[] {
		return this.#scheduled.map(({ alert, at, startsAt, file }) => ({ alert, at, startsAt, file }));
	}

	/**
	 * Lets the player make sound, and starts loading the chimes.
	 *
	 * @remarks
	 * Call it from a user gesture, such as the Play press, since browsers allow audio to start only
	 * then. The first call makes the audio context, and every call asks it to resume, since a phone
	 * can suspend it, such as for a call. Once it has resumed, the last run's chime is placed again
	 * from the wall clock, in case the audio clock stood still. A context that can't be made, or
	 * can't resume, is logged, and the player stays silent.
	 *
	 * @returns A promise of whether the audio can play: `true` once the context has resumed, or
	 * `false` when it can't be made or resumed. It never rejects.
	 */
	async unlock(): Promise<boolean> {
		const output = this.#output ?? this.#openOutput();
		if (output === null) {
			return false;
		}
		for (const file of Object.values(this.#files)) {
			void this.#soundFor(output.context, file);
		}
		try {
			await output.context.resume();
		} catch (error: unknown) {
			void recordError('Could not start the audio for the chimes', error);
			return false;
		}
		await this.catchUp();
		return true;
	}

	/**
	 * Places the last run's chime again from the wall clock, in case the audio clock stood still
	 * while time went on, as it does while a laptop sleeps.
	 *
	 * @remarks
	 * The app calls it as the page shows again. A chime whose moment has passed is dropped rather
	 * than played late. A chime still placed within {@link ALLOWED_DRIFT_MS} of its moment is left
	 * as it is, so an unlock, such as a preview's, doesn't restart it. Before any reschedule, or
	 * after {@link ChimePlayer.cancel}, it does nothing.
	 *
	 * @returns A promise that settles once the chime is placed again, or there's none. It never
	 * rejects.
	 */
	async catchUp(): Promise<void> {
		const run = this.#lastRun;
		const output = this.#output;
		if (run === null || output === null) {
			return;
		}
		const now = this.#clock();
		if (this.#isInPlace(run, now, output.context)) {
			return;
		}
		await this.reschedule(run, now);
	}

	/**
	 * Says whether what's scheduled is still the run's next chime, at its moment on the audio
	 * clock.
	 *
	 * @param run - The run the chime was scheduled for.
	 * @param now - The current moment on the wall clock, in milliseconds since 1970 (UTC).
	 * @param context - The audio context, whose clock the chime is placed on.
	 * @returns `true` when nothing is due and nothing is scheduled, or when the scheduled chime is
	 * the due one, starting within {@link ALLOWED_DRIFT_MS} of its moment.
	 */
	#isInPlace(run: RunState, now: number, context: ChimeAudioContext): boolean {
		const chime = nextChime(run, now);
		const placed = this.#scheduled.at(-1);
		if (chime === null || placed === undefined) {
			return chime === null && placed === undefined;
		}
		const dueStartsAt = context.currentTime + (chime.at - now) / MS_PER_SECOND;
		const driftMs = Math.abs(placed.startsAt - dueStartsAt) * MS_PER_SECOND;
		return placed.at === chime.at && driftMs <= ALLOWED_DRIFT_MS;
	}

	/**
	 * Cancels the chimes still to play, and forgets the run, so nothing is placed again until the
	 * next reschedule, as when another tab takes over sounding them. A chime already playing
	 * finishes.
	 */
	cancel(): void {
		this.#rescheduleCount++;
		this.#lastRun = null;
		this.#cancelScheduled();
	}

	/**
	 * Cancels the chimes still to play and schedules the run's next chime, after any change to the
	 * run.
	 *
	 * @remarks
	 * A chime already playing carries on. Before the player is unlocked, nothing is scheduled. A
	 * chime still loading is scheduled once it's loaded, unless a later reschedule replaced this
	 * one first, and placed from the time loading took. If loading took past its moment, it plays
	 * at once, or not at all when it's over {@link LATE_CHIME_TOLERANCE_MS} late.
	 *
	 * @param run - The run as it is now.
	 * @param now - The current moment, in milliseconds since 1970 (UTC), the same moment the run's
	 * change was made at.
	 * @returns A promise that settles once the chime is scheduled, or once there's nothing to
	 * schedule. It never rejects.
	 */
	async reschedule(run: RunState, now: number): Promise<void> {
		this.#rescheduleCount++;
		const thisReschedule = this.#rescheduleCount;
		this.#lastRun = run;
		this.#cancelScheduled();

		const output = this.#output;
		const chime = nextChime(run, now);
		if (output === null || chime === null) {
			return;
		}

		const clockBeforeLoad = this.#clock();
		const file = this.#files[chime.alert];
		const sound = await this.#soundFor(output.context, file);
		const isReplaced = thisReschedule !== this.#rescheduleCount;
		if (sound === null || isReplaced) {
			return;
		}

		// Measured on the wall clock, which goes on even if the audio clock stopped meanwhile.
		const nowAfterLoad = now + (this.#clock() - clockBeforeLoad);
		const lateMs = nowAfterLoad - chime.at;
		if (lateMs > LATE_CHIME_TOLERANCE_MS) {
			return;
		}
		const delaySeconds = (chime.at - nowAfterLoad) / MS_PER_SECOND;
		const startsAt = output.context.currentTime + delaySeconds;
		const source = this.#startSource(output, sound, startsAt);
		this.#scheduled.push({ ...chime, startsAt, file, source });
	}

	/**
	 * Starts a chime playing through the volume control.
	 *
	 * @param output - The audio output to play through.
	 * @param sound - The decoded chime.
	 * @param startsAt - When it starts, in seconds on the audio clock. A moment that has passed
	 * starts it at once.
	 * @returns The source playing it, so it can be cancelled.
	 */
	#startSource(output: AudioOutput, sound: ChimeSound, startsAt: number): ChimeSource {
		const source = output.context.createBufferSource();
		source.buffer = sound;
		source.connect(output.volume);
		source.start(startsAt);
		return source;
	}

	/**
	 * Plays a chime file at once, through the volume, as a preview.
	 *
	 * @remarks
	 * Call it from a user gesture, such as pressing a Preview button, since browsers allow audio to
	 * start only then. It unlocks the player itself, so a preview needs no earlier press, and it
	 * leaves the scheduled chimes alone, so previewing during a run changes nothing about the run's
	 * chime. A file that can't be loaded is logged, and nothing plays.
	 *
	 * @param file - The chime file's address, such as one of {@link ChimeFiles}'s.
	 * @returns A promise that settles once the chime has started, or once it's clear it can't.
	 * It never rejects.
	 */
	async preview(file: string): Promise<void> {
		void this.unlock();
		const output = this.#output;
		if (output === null) {
			return;
		}
		const sound = await this.#soundFor(output.context, file);
		if (sound === null) {
			return;
		}
		// A moment that has passed starts the chime at once.
		this.#startSource(output, sound, 0);
	}

	/**
	 * Changes the volume, for the chimes already scheduled and every later one.
	 *
	 * @param volume - The volume, as a gain from 0 for silence to 1 for the chimes as recorded.
	 * A value outside that range is held to it.
	 */
	setVolume(volume: number): void {
		this.#volume = clampVolume(volume);
		if (this.#output !== null) {
			this.#output.volume.gain.value = this.#volume;
		}
	}

	/**
	 * Changes the chime file each alert plays, from the next reschedule on.
	 *
	 * @param files - The chime file for each alert.
	 */
	setFiles(files: ChimeFiles): void {
		this.#files = files;
	}

	/**
	 * Makes the audio context and the volume control, connected to the speakers, and listens for
	 * the audio clock to run again after stopping, to place the chime again.
	 *
	 * @returns The audio output, or `null` when the context can't be made, which is logged.
	 */
	#openOutput(): AudioOutput | null {
		try {
			const context = this.#createContext();
			const volume = context.createGain();
			volume.gain.value = this.#volume;
			volume.connect(context.destination);
			context.addEventListener('statechange', () => {
				if (context.state === 'running') {
					void this.catchUp();
				}
			});
			this.#output = { context, volume };
			return this.#output;
		} catch (error) {
			void recordError('Could not set up the audio for the chimes', error);
			return null;
		}
	}

	/**
	 * Stops every scheduled chime that hasn't started, and forgets them all, since one already
	 * playing can't be taken back and is left to finish.
	 */
	#cancelScheduled(): void {
		// Chimes are scheduled only once the output is open, so without it there's nothing to stop.
		if (this.#output === null) {
			return;
		}
		const audioNow = this.#output.context.currentTime;
		for (const playback of this.#scheduled) {
			const hasStarted = playback.startsAt <= audioNow;
			if (!hasStarted) {
				playback.source.stop();
			}
		}
		this.#scheduled = [];
	}

	/**
	 * Loads a chime file, fetching and decoding it only the first time it's asked for.
	 *
	 * @param context - The audio context, which decodes it.
	 * @param file - The chime file's address.
	 * @returns A promise of the decoded chime, or of `null` when it couldn't be fetched or decoded,
	 * which is logged once. It never rejects.
	 */
	#soundFor(context: ChimeAudioContext, file: string): Promise<ChimeSound | null> {
		const loaded = this.#sounds.get(file);
		if (loaded !== undefined) {
			return loaded;
		}
		const loading = this.#load(context, file).catch((error: unknown) => {
			void recordError(`Could not load the chime ${file}`, error);
			return null;
		});
		this.#sounds.set(file, loading);
		return loading;
	}

	/**
	 * Fetches and decodes a chime file.
	 *
	 * @param context - The audio context, which decodes it.
	 * @param file - The chime file's address.
	 * @returns A promise of the decoded chime.
	 * @throws {@link Error} When the server answers with an error, such as 404 for a missing file.
	 * The promise also rejects when the fetch fails, or the file isn't audio the browser can decode.
	 */
	async #load(context: ChimeAudioContext, file: string): Promise<ChimeSound> {
		const response = await this.#fetchFile(file);
		if (!response.ok) {
			throw new Error(`The server answered ${response.status}`);
		}
		const data = await response.arrayBuffer();
		return context.decodeAudioData(data);
	}
}

/**
 * Holds a volume to the range a gain takes.
 *
 * @param volume - The volume asked for.
 * @returns The volume, from 0 to 1.
 */
function clampVolume(volume: number): number {
	return Math.min(1, Math.max(0, volume));
}
