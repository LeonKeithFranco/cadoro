import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { ChimePlayer, type ChimeFiles, type ChimePlayerOptions } from './chime-player';
import { createRun, next, pause, play, type RunState } from './run';
import { FakeAudioContext, fakeFiles, undecodable, type FakeSound } from './testing/audio';
import { minutes, seconds } from './testing/durations';
import { routineWith } from './testing/routines';

/** The moment every run in these tests starts, an arbitrary one in milliseconds since 1970. */
const start = Date.UTC(2026, 10, 19, 9, 0, 0);

/** A different chime file for each alert, so a test can tell which one was scheduled. */
const files: ChimeFiles = { target: '/chimes/target.mp3', break: '/chimes/break.mp3' };

/** The text each of {@link files} holds, which the fake context's sounds remember. */
const served = { [files.target]: 'target chime', [files.break]: 'break chime' };

/**
 * A run of a routine that repeats one 25-minute block at 20% forever, started at {@link start},
 * so its target chime is due 25 minutes later.
 */
const working: RunState = play(createRun(routineWith({ rounds: 'infinite' })), start);

/** What a test sets up: the player, and the fakes it was given, to drive and check. */
type Setup = {
	/** The player under test. */
	player: ChimePlayer;
	/** The audio context the player makes when unlocked. */
	context: FakeAudioContext;
	/** A spy on the player's audio context factory. */
	createContext: MockInstance<() => FakeAudioContext>;
	/** A spy on the player's fetch. */
	fetchFile: MockInstance<(url: string) => Promise<Response>>;
};

/**
 * Makes a player with a fake audio context and fake files, at half volume, not yet unlocked.
 *
 * @param options - Anything that differs from the defaults: {@link files}, served as
 * {@link served}, at a volume of 0.5.
 * @returns The player and its fakes.
 */
function setUp(options: Partial<ChimePlayerOptions> = {}): Setup {
	const context = new FakeAudioContext();
	const createContext = vi.fn(() => context);
	const fetchFile = vi.fn(fakeFiles(served));
	const player = new ChimePlayer({ files, volume: 0.5, createContext, fetchFile, ...options });
	return { player, context, createContext, fetchFile };
}

/**
 * Makes a player as {@link setUp} does, and unlocks it, as the Play press will.
 *
 * @param options - Anything that differs from {@link setUp}'s defaults.
 * @returns The player and its fakes.
 */
function setUpUnlocked(options: Partial<ChimePlayerOptions> = {}): Setup {
	const setup = setUp(options);
	setup.player.unlock();
	return setup;
}

/**
 * Reads which file a fake source's sound was decoded from.
 *
 * @param context - The fake audio context.
 * @param index - Which of its sources, in the order they were made.
 * @returns The text of the file the source plays, or `undefined` if it has no sound.
 */
function playedFile(context: FakeAudioContext, index: number): string | undefined {
	const sound = context.sources[index]?.buffer as FakeSound | null | undefined;
	return sound?.decodedFrom;
}

describe('ChimePlayer', () => {
	let logged: MockInstance<typeof console.error>;

	// Failures are logged with `console.error`, which the tests check, and keep out of the output.
	beforeEach(() => {
		logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
	});

	// Puts the real `console.error` back.
	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('before it is unlocked', () => {
		it('makes no audio context, fetches nothing and schedules nothing', async () => {
			const { player, createContext, fetchFile } = setUp();

			await player.reschedule(working, start);

			expect(createContext).not.toHaveBeenCalled();
			expect(fetchFile).not.toHaveBeenCalled();
			expect(player.scheduled).toEqual([]);
		});
	});

	describe('unlocking', () => {
		it('makes one audio context, with its volume connected to the speakers', () => {
			const { player, context, createContext } = setUpUnlocked();
			player.unlock();

			expect(createContext).toHaveBeenCalledTimes(1);
			expect(context.gains).toHaveLength(1);
			expect(context.gains[0]?.gain.value).toBe(0.5);
			expect(context.gains[0]?.connections).toEqual([context.destination]);
		});

		it('asks the audio context to resume on every unlock', () => {
			const { player, context } = setUpUnlocked();
			player.unlock();

			expect(context.resumeCount).toBe(2);
		});

		it('fetches each chime file once', () => {
			const { player, fetchFile } = setUpUnlocked();
			player.unlock();

			expect(fetchFile).toHaveBeenCalledTimes(2);
			expect(fetchFile).toHaveBeenCalledWith(files.target);
			expect(fetchFile).toHaveBeenCalledWith(files.break);
		});

		it('fetches a file both alerts share only once', () => {
			const { fetchFile } = setUpUnlocked({ files: { target: files.target, break: files.target } });

			expect(fetchFile).toHaveBeenCalledTimes(1);
		});

		it('logs an audio context that cannot be made, and stays silent', async () => {
			const { player } = setUpUnlocked({
				createContext: () => {
					throw new Error('AudioContext is not defined');
				}
			});

			await player.reschedule(working, start);

			expect(logged).toHaveBeenCalledWith(
				'Could not set up the audio for the chimes',
				expect.any(Error)
			);
			expect(player.scheduled).toEqual([]);
		});

		it('logs an audio context that cannot resume', async () => {
			const context = new FakeAudioContext();
			context.resumeError = new Error('Not allowed to start');

			setUpUnlocked({ createContext: () => context });

			await expect
				.poll(() => logged.mock.calls)
				.toContainEqual(['Could not start the audio for the chimes', context.resumeError]);
		});
	});

	describe('scheduling', () => {
		it('schedules the target chime on the audio clock, through the volume', async () => {
			const { player, context } = setUpUnlocked();
			context.currentTime = 100;

			await player.reschedule(working, start);

			expect(player.scheduled).toEqual([
				{ alert: 'target', at: start + minutes(25), startsAt: 100 + 25 * 60, file: files.target }
			]);
			expect(context.sources).toHaveLength(1);
			expect(context.sources[0]?.startedAt).toBe(100 + 25 * 60);
			expect(context.sources[0]?.connections).toEqual([context.gains[0]]);
			expect(playedFile(context, 0)).toBe('target chime');
		});

		it('counts the wait from the moment of the change', async () => {
			const { player, context } = setUpUnlocked();
			context.currentTime = 100;

			await player.reschedule(working, start + minutes(10) + seconds(30));

			expect(context.sources[0]?.startedAt).toBe(100 + 14 * 60 + 30);
		});

		it('schedules the break chime with the break’s file', async () => {
			const { player, context } = setUpUnlocked();
			const onBreak = next(working, start + minutes(25));

			await player.reschedule(onBreak, start + minutes(25));

			expect(player.scheduled).toEqual([
				{ alert: 'break', at: start + minutes(30), startsAt: 5 * 60, file: files.break }
			]);
			expect(playedFile(context, 0)).toBe('break chime');
		});

		it('schedules nothing when no chime is due', async () => {
			const { player, context } = setUpUnlocked();
			const paused = pause(working, start + minutes(5));

			await player.reschedule(paused, start + minutes(5));

			expect(player.scheduled).toEqual([]);
			expect(context.sources).toEqual([]);
		});

		it('fetches a chime file only once however often it schedules', async () => {
			const { player, fetchFile } = setUpUnlocked();

			await player.reschedule(working, start);
			await player.reschedule(working, start + seconds(1));
			await player.reschedule(working, start + seconds(2));

			expect(fetchFile.mock.calls.filter(([url]) => url === files.target)).toHaveLength(1);
		});
	});

	describe('rescheduling', () => {
		it('stops a chime that has not started when the run pauses', async () => {
			const { player, context } = setUpUnlocked();
			await player.reschedule(working, start);
			context.currentTime = 60;

			await player.reschedule(pause(working, start + minutes(1)), start + minutes(1));

			expect(context.sources[0]?.isStopped).toBe(true);
			expect(player.scheduled).toEqual([]);
		});

		it('replaces a chime with one at the run’s new moment', async () => {
			const { player, context } = setUpUnlocked();
			await player.reschedule(working, start);
			const resumed = play(pause(working, start + minutes(1)), start + minutes(3));
			context.currentTime = 3 * 60;

			await player.reschedule(resumed, start + minutes(3));

			expect(context.sources[0]?.isStopped).toBe(true);
			expect(context.sources[1]?.startedAt).toBe(27 * 60);
			expect(context.sources[1]?.isStopped).toBe(false);
			expect(player.scheduled).toEqual([
				{ alert: 'target', at: start + minutes(27), startsAt: 27 * 60, file: files.target }
			]);
		});

		it('lets a chime that has started play on', async () => {
			const { player, context } = setUpUnlocked();
			await player.reschedule(working, start);
			context.currentTime = 25 * 60;

			await player.reschedule(next(working, start + minutes(25)), start + minutes(25));

			expect(context.sources[0]?.isStopped).toBe(false);
		});

		it('drops a schedule that a later one replaced while its chime was loading', async () => {
			let serveFile: (response: Response) => void = () => undefined;
			const slowFetch = (): Promise<Response> =>
				new Promise((resolve) => {
					serveFile = resolve;
				});
			const { player, context } = setUpUnlocked({
				files: { target: files.target, break: files.target },
				fetchFile: slowFetch
			});

			const first = player.reschedule(working, start);
			const second = player.reschedule(pause(working, start + seconds(1)), start + seconds(1));
			serveFile(new Response('target chime'));
			await Promise.all([first, second]);

			expect(context.sources).toEqual([]);
			expect(player.scheduled).toEqual([]);
		});
	});

	describe('a chime file that cannot be played', () => {
		it('logs a missing file, and schedules nothing', async () => {
			const { player, context } = setUpUnlocked({ fetchFile: fakeFiles({}) });

			await player.reschedule(working, start);

			expect(logged).toHaveBeenCalledWith(
				`Could not load the chime ${files.target}`,
				new Error('The server answered 404')
			);
			expect(context.sources).toEqual([]);
			expect(player.scheduled).toEqual([]);
		});

		it('logs a file that cannot be decoded, and schedules nothing', async () => {
			const { player, context } = setUpUnlocked({
				fetchFile: fakeFiles({ ...served, [files.target]: `${undecodable}, but a web page` })
			});

			await player.reschedule(working, start);

			expect(logged).toHaveBeenCalledWith(
				`Could not load the chime ${files.target}`,
				new Error('Unable to decode audio data')
			);
			expect(context.sources).toEqual([]);
		});

		it('logs a fetch that fails, and schedules nothing', async () => {
			const offline = new TypeError('Failed to fetch');
			const { player, context } = setUpUnlocked({ fetchFile: () => Promise.reject(offline) });

			await player.reschedule(working, start);

			expect(logged).toHaveBeenCalledWith(`Could not load the chime ${files.target}`, offline);
			expect(context.sources).toEqual([]);
		});

		it('tries a file that failed only once', async () => {
			const fetchFile = vi.fn(fakeFiles({}));
			const { player } = setUpUnlocked({ fetchFile });

			await player.reschedule(working, start);
			await player.reschedule(working, start + seconds(1));

			expect(fetchFile.mock.calls.filter(([url]) => url === files.target)).toHaveLength(1);
			expect(
				logged.mock.calls.filter(
					([message]) => message === `Could not load the chime ${files.target}`
				)
			).toHaveLength(1);
		});

		it('still plays the other alert’s chime', async () => {
			const { player, context } = setUpUnlocked({
				fetchFile: fakeFiles({ [files.break]: 'break chime' })
			});
			const onBreak = next(working, start + minutes(25));

			await player.reschedule(onBreak, start + minutes(25));

			expect(playedFile(context, 0)).toBe('break chime');
		});
	});

	describe('previewing a chime', () => {
		it('unlocks the player and plays the file at once, through the volume', async () => {
			const { player, context, createContext } = setUp();

			await player.preview(files.break);

			expect(createContext).toHaveBeenCalledTimes(1);
			expect(context.resumeCount).toBe(1);
			expect(playedFile(context, 0)).toBe('break chime');
			expect(context.sources[0]?.startedAt).toBe(0);
			expect(context.sources[0]?.connections).toEqual([context.gains[0]]);
		});

		it('plays at the volume the player has', async () => {
			const { player, context } = setUp();
			player.setVolume(0.2);

			await player.preview(files.target);

			expect(context.gains[0]?.gain.value).toBe(0.2);
		});

		it('leaves the scheduled chime alone', async () => {
			const { player, context } = setUpUnlocked();
			await player.reschedule(working, start);
			const [scheduled] = player.scheduled;

			await player.preview(files.break);

			expect(player.scheduled).toEqual([scheduled]);
			expect(context.sources[0]?.isStopped).toBe(false);
		});

		it('logs a file that cannot be loaded, and plays nothing', async () => {
			const { player, context } = setUp({ fetchFile: fakeFiles({}) });

			await player.preview(files.target);

			expect(logged).toHaveBeenCalledWith(
				`Could not load the chime ${files.target}`,
				new Error('The server answered 404')
			);
			expect(context.sources).toEqual([]);
		});

		it('plays nothing when the audio context cannot be made', async () => {
			const { player } = setUp({
				createContext: () => {
					throw new Error('No Web Audio');
				}
			});

			await expect(player.preview(files.target)).resolves.toBeUndefined();

			expect(logged).toHaveBeenCalledWith(
				'Could not set up the audio for the chimes',
				new Error('No Web Audio')
			);
		});
	});

	describe('volume', () => {
		it('changes the gain every chime plays through', () => {
			const { player, context } = setUpUnlocked();

			player.setVolume(0.25);

			expect(context.gains[0]?.gain.value).toBe(0.25);
		});

		it('keeps a volume set before unlocking for when it unlocks', () => {
			const { player, context } = setUp();

			player.setVolume(0.8);
			player.unlock();

			expect(context.gains[0]?.gain.value).toBe(0.8);
		});

		it('holds a volume above 1 to 1', () => {
			const { player, context } = setUpUnlocked();

			player.setVolume(1.5);

			expect(context.gains[0]?.gain.value).toBe(1);
		});

		it('holds a volume below 0 to 0', () => {
			const { player, context } = setUpUnlocked();

			player.setVolume(-0.5);

			expect(context.gains[0]?.gain.value).toBe(0);
		});

		it('holds the starting volume to 0 to 1', () => {
			const { context } = setUpUnlocked({ volume: 2 });

			expect(context.gains[0]?.gain.value).toBe(1);
		});
	});

	describe('changing the chime files', () => {
		it('plays the new file from the next reschedule', async () => {
			const otherFile = '/chimes/other.mp3';
			const { player, context } = setUpUnlocked({
				fetchFile: fakeFiles({ ...served, [otherFile]: 'other chime' })
			});

			player.setFiles({ target: otherFile, break: files.break });
			await player.reschedule(working, start);

			expect(player.scheduled[0]?.file).toBe(otherFile);
			expect(playedFile(context, 0)).toBe('other chime');
		});
	});
});
