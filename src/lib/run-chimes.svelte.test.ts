import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useErrorLog } from './error-log';
import { RunChimes } from './run-chimes.svelte';
import { DEFAULT_SETTINGS, type Settings } from './settings';
import { SettingsSession } from './settings.svelte';
import { InMemoryStorage } from './storage/in-memory-storage';
import { FakeAudioContext, fakeFiles, type FakeSound } from './testing/audio';
import { minutes, seconds } from './testing/durations';
import { numberedIds } from './testing/ids';
import { routineWith } from './testing/routines';
import { TimerSession } from './timer.svelte';

/** A 25-minute block at 20%, repeating forever, so Next always starts a 5-minute break. */
const foreverRoutine = routineWith({ id: 'forever', title: 'Forever', rounds: 'infinite' });

/** The fake clock's current moment, in milliseconds since 1970, which each test moves by hand. */
let nowMs = 0;

/** The revisions of every tab in a test, numbered, so two tabs never make the same one. */
let newRevision = numberedIds('revision');

/**
 * The name of this test's chime lock. Each test has its own, since a lock lasts as long as the
 * page, and every test runs in the same page.
 */
let lockName = '';

/** Counts the tests, to give each its own lock name. */
let testCount = 0;

/** One tab of the app: its timer session, its settings, its chimes and its fake audio. */
type Tab = {
	/** The tab's timer session, whose presses unlock its chimes. */
	readonly timer: TimerSession;
	/** The tab's settings session. */
	readonly settings: SettingsSession;
	/** The tab's chimes, following its timer session and settings. */
	readonly chimes: RunChimes;
	/** The tab's audio context, made once its chimes are unlocked. */
	readonly audio: FakeAudioContext;
	/** How many times the tab's chimes made an audio context. */
	readonly contextsMade: () => number;
};

/**
 * Opens a tab of the app on the fake clock, with fake audio and the fake chime files, each
 * decoding to its chime's id, and the session's presses unlocking the chimes, as the app's are.
 *
 * @param storage - The storage the tab saves to, which two tabs share.
 * @param options - What differs from the app's own: `hasNoLocks`, true for a browser without the
 * Web Locks API, where the tab gets no lock manager, rather than the browser's real one; `name`,
 * the lock's name, which is this test's unless given; `settings`, the settings the tab opens
 * with, as storage holds them, which are the defaults unless given; and `hasNoAudio`, true for a
 * browser where the audio context can't be made.
 * @returns The tab.
 */
function openTab(
	storage: InMemoryStorage,
	{
		hasNoLocks = false,
		name = lockName,
		settings = DEFAULT_SETTINGS,
		hasNoAudio = false
	}: { hasNoLocks?: boolean; name?: string; settings?: Settings; hasNoAudio?: boolean } = {}
): Tab {
	const audio = new FakeAudioContext();
	let contexts = 0;
	const settingsSession = new SettingsSession(storage, settings);
	const timer = new TimerSession(
		[foreverRoutine],
		{
			clock: (): number => nowMs,
			storage,
			newId: numberedIds(),
			newRevision,
			onWorkSaved: vi.fn(),
			onPress: (): void => {
				chimes.unlock();
			},
			onTick: (): void => {
				void chimes.catchUp();
			}
		},
		{ saved: null, isAnotherTabOpen: false }
	);
	const chimes = new RunChimes({
		timer,
		settings: settingsSession,
		clock: (): number => nowMs,
		locks: hasNoLocks ? undefined : navigator.locks,
		address: (file: string): string => `/${file}`,
		lockName: name,
		createContext: (): FakeAudioContext => {
			contexts++;
			if (hasNoAudio) {
				throw new Error('AudioContext is not defined');
			}
			return audio;
		},
		fetchFile: fakeFiles({
			'/chimes/bell-ding-1.mp3': 'bell-ding-1',
			'/chimes/bell-ding-2.mp3': 'bell-ding-2',
			'/chimes/bell-ding-3.mp3': 'bell-ding-3'
		})
	});
	return { timer, settings: settingsSession, chimes, audio, contextsMade: (): number => contexts };
}

/**
 * Waits for every effect, chime load and lock request already started to finish, so a test can
 * check that something didn't happen.
 *
 * @returns A promise that settles after a few of the browser's tasks.
 */
async function afterPendingWork(): Promise<void> {
	await new Promise<void>((resolve) => {
		setTimeout(resolve, 50);
	});
}

/**
 * Holds this test's chime lock, as a tab sounding the chimes elsewhere does, until the test lets
 * it go.
 *
 * @returns A promise of the function that lets the lock go, once the lock is held.
 */
async function holdLockElsewhere(): Promise<() => void> {
	const { promise: released, resolve: release } = Promise.withResolvers<void>();
	const { promise: held, resolve: markHeld } = Promise.withResolvers<void>();
	void navigator.locks.request(lockName, async () => {
		markHeld();
		await released;
	});
	await held;
	return release;
}

// Starts each test at the fake clock's 0, with revisions numbered again and a lock of its own.
beforeEach(() => {
	nowMs = 0;
	newRevision = numberedIds('revision');
	testCount++;
	lockName = `cadoro-chimes-test-${testCount}`;
});

// Puts back what a test spied on, and takes away the log a test chose for errors.
afterEach(() => {
	useErrorLog(null);
	vi.restoreAllMocks();
});

describe('scheduling the run’s chimes', () => {
	it('stays silent, making no audio, until a button is pressed', async () => {
		const tab = openTab(new InMemoryStorage());

		await afterPendingWork();

		expect(tab.contextsMade()).toBe(0);
		expect(tab.chimes.isSounding).toBe(false);
		expect(tab.chimes.scheduled).toEqual([]);
	});

	it('unlocks the audio on Play and schedules the target chime for when work reaches it', async () => {
		const tab = openTab(new InMemoryStorage());

		tab.timer.play();

		expect(tab.audio.resumeCount).toBe(1);
		await expect
			.poll(() => tab.chimes.scheduled)
			.toEqual([
				{ alert: 'target', at: minutes(25), startsAt: 1500, file: '/chimes/bell-ding-1.mp3' }
			]);
	});

	it('cancels the chime on Pause, and schedules it again from the work left on Play', async () => {
		const tab = openTab(new InMemoryStorage());
		tab.timer.play();
		await expect.poll(() => tab.chimes.scheduled).toHaveLength(1);
		const [firstSource] = tab.audio.sources;

		nowMs = minutes(10);
		tab.audio.currentTime = 600;
		tab.timer.pause();
		await expect.poll(() => tab.chimes.scheduled).toEqual([]);
		expect(firstSource?.isStopped).toBe(true);

		nowMs = minutes(15);
		tab.audio.currentTime = 900;
		tab.timer.play();
		await expect
			.poll(() => tab.chimes.scheduled)
			.toEqual([expect.objectContaining({ alert: 'target', at: minutes(30), startsAt: 1800 })]);
	});

	it('schedules the break chime for 0:00 when Next starts the break', async () => {
		const tab = openTab(new InMemoryStorage());
		tab.timer.play();

		nowMs = minutes(25);
		tab.audio.currentTime = 1500;
		tab.timer.next();

		await expect
			.poll(() => tab.chimes.scheduled)
			.toEqual([expect.objectContaining({ alert: 'break', at: minutes(30), startsAt: 1800 })]);
	});

	it('schedules nothing more once Finish ends the run', async () => {
		const tab = openTab(new InMemoryStorage());
		tab.timer.play();
		await expect.poll(() => tab.chimes.scheduled).toHaveLength(1);

		nowMs = minutes(5);
		tab.timer.finish();

		await expect.poll(() => tab.chimes.scheduled).toEqual([]);
	});

	it('never reschedules on a tick while the audio clock keeps time', async () => {
		const tab = openTab(new InMemoryStorage());
		tab.timer.play();
		await expect.poll(() => tab.chimes.scheduled).toHaveLength(1);

		// The audio clock moves with the wall clock, as it does while nothing stops it.
		for (const second of [1, 2, 3]) {
			nowMs = seconds(second);
			tab.audio.currentTime = second;
			tab.timer.tick();
		}
		await afterPendingWork();

		expect(tab.audio.sources).toHaveLength(1);
		expect(tab.audio.sources[0]?.isStopped).toBe(false);
	});
});

describe('the chimes and volume from Settings', () => {
	it('plays the chime chosen for each alert', async () => {
		const storage = new InMemoryStorage();
		await storage.saveSettings({ targetChime: 'bell-ding-2', breakChime: 'bell-ding-3' });
		const tab = openTab(storage, { settings: await storage.getSettings() });
		tab.timer.play();
		await expect
			.poll(() => tab.chimes.scheduled)
			.toEqual([expect.objectContaining({ alert: 'target', file: '/chimes/bell-ding-2.mp3' })]);

		nowMs = minutes(25);
		tab.timer.next();

		await expect
			.poll(() => tab.chimes.scheduled)
			.toEqual([expect.objectContaining({ alert: 'break', file: '/chimes/bell-ding-3.mp3' })]);
	});

	it('moves the scheduled chime to a new choice, even one saved in another tab', async () => {
		const storage = new InMemoryStorage();
		const tab = openTab(storage);
		const otherTabSettings = new SettingsSession(storage, DEFAULT_SETTINGS);
		tab.timer.play();
		await expect.poll(() => tab.chimes.scheduled).toHaveLength(1);

		await otherTabSettings.save({ targetChime: 'bell-ding-3' });

		await expect
			.poll(() => tab.chimes.scheduled)
			.toEqual([
				expect.objectContaining({
					alert: 'target',
					at: minutes(25),
					file: '/chimes/bell-ding-3.mp3'
				})
			]);
		expect(tab.audio.sources[0]?.isStopped).toBe(true);
	});

	it('leaves the scheduled chime alone when a setting it doesn’t use changes', async () => {
		const tab = openTab(new InMemoryStorage());
		tab.timer.play();
		await expect.poll(() => tab.chimes.scheduled).toHaveLength(1);

		await tab.settings.save({ theme: 'light' });
		await afterPendingWork();

		expect(tab.audio.sources).toHaveLength(1);
	});

	it('plays at the volume from Settings, as a gain from 0 to 1, and follows a change', async () => {
		const tab = openTab(new InMemoryStorage());
		tab.timer.play();
		await expect.poll(() => tab.chimes.scheduled).toHaveLength(1);
		const [gain] = tab.audio.gains;
		expect(gain?.gain.value).toBe(0.7);

		await tab.settings.save({ volume: 40 });

		await expect.poll(() => gain?.gain.value).toBe(0.4);
		expect(tab.audio.sources).toHaveLength(1);
	});
});

describe('previewing a chime', () => {
	it('plays the chime at once without a run, and without taking the turn to sound', async () => {
		const tab = openTab(new InMemoryStorage());

		await tab.chimes.preview('bell-ding-2');

		expect(tab.audio.sources).toHaveLength(1);
		expect((tab.audio.sources[0]?.buffer as FakeSound).decodedFrom).toBe('bell-ding-2');
		expect(tab.audio.sources[0]?.startedAt).toBe(0);
		expect(tab.chimes.isSounding).toBe(false);
		expect(tab.chimes.scheduled).toEqual([]);
	});

	it('plays the default chime for an id the app doesn’t have', async () => {
		const tab = openTab(new InMemoryStorage());

		await tab.chimes.preview('a-removed-chime');

		expect((tab.audio.sources[0]?.buffer as FakeSound).decodedFrom).toBe('bell-ding-1');
	});

	it('leaves the run’s scheduled chime in place', async () => {
		const tab = openTab(new InMemoryStorage());
		tab.timer.play();
		await expect.poll(() => tab.chimes.scheduled).toHaveLength(1);

		await tab.chimes.preview('bell-ding-3');

		expect(tab.chimes.scheduled).toHaveLength(1);
		expect(tab.audio.sources[0]?.isStopped).toBe(false);
	});
});

describe('when the audio clock stood still', () => {
	it('places the chime again from the wall clock as the page shows again', async () => {
		const tab = openTab(new InMemoryStorage());
		tab.timer.play();
		await expect.poll(() => tab.chimes.scheduled).toHaveLength(1);

		// 20 minutes pass, but the audio clock ran for only 15 of them, as when a laptop sleeps.
		nowMs = minutes(20);
		tab.audio.currentTime = 15 * 60;
		document.dispatchEvent(new Event('visibilitychange'));

		await expect
			.poll(() => tab.chimes.scheduled)
			.toEqual([expect.objectContaining({ alert: 'target', at: minutes(25), startsAt: 20 * 60 })]);
	});

	it('drops a chime on the next tick when the wall clock jumped past it with no event', async () => {
		const tab = openTab(new InMemoryStorage());
		tab.timer.play();
		await expect.poll(() => tab.chimes.scheduled).toHaveLength(1);

		// Asleep from 3 minutes before the target to 20 after, in a background tab that hears
		// neither the audio running again nor the page showing.
		tab.audio.currentTime = 22 * 60;
		nowMs = minutes(45);
		tab.timer.tick();

		await expect.poll(() => tab.audio.sources[0]?.isStopped).toBe(true);
		expect(tab.chimes.scheduled).toEqual([]);
	});

	it('places the chime again on the next tick when the audio clock fell behind with no event', async () => {
		const tab = openTab(new InMemoryStorage());
		tab.timer.play();
		await expect.poll(() => tab.chimes.scheduled).toHaveLength(1);

		nowMs = minutes(20);
		tab.audio.currentTime = 15 * 60;
		tab.timer.tick();

		await expect
			.poll(() => tab.chimes.scheduled)
			.toEqual([expect.objectContaining({ at: minutes(25), startsAt: 20 * 60 })]);
	});

	it('leaves the chime as it is when the page is hidden', async () => {
		const tab = openTab(new InMemoryStorage());
		tab.timer.play();
		await expect.poll(() => tab.chimes.scheduled).toHaveLength(1);
		vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');

		nowMs = minutes(20);
		tab.audio.currentTime = 15 * 60;
		document.dispatchEvent(new Event('visibilitychange'));
		await afterPendingWork();

		expect(tab.chimes.scheduled).toEqual([expect.objectContaining({ startsAt: 25 * 60 })]);
	});
});

describe('one tab sounding', () => {
	it('sounds each chime in the first tab a button was pressed in, and not in the others', async () => {
		const storage = new InMemoryStorage();
		const firstTab = openTab(storage);
		const secondTab = openTab(storage);

		firstTab.timer.play();
		await expect.poll(() => secondTab.timer.run.status).toBe('working');
		secondTab.timer.pause();
		await expect.poll(() => firstTab.timer.run).toMatchObject({ runningSince: null });
		secondTab.timer.play();

		await expect
			.poll(() => firstTab.chimes.scheduled)
			.toEqual([expect.objectContaining({ alert: 'target', at: minutes(25) })]);
		await afterPendingWork();
		expect(firstTab.chimes.isSounding).toBe(true);
		expect(secondTab.chimes.isSounding).toBe(false);
		expect(secondTab.audio.sources).toEqual([]);
	});

	it('reschedules in the sounding tab when another tab changes the run', async () => {
		const storage = new InMemoryStorage();
		const soundingTab = openTab(storage);
		const otherTab = openTab(storage);
		soundingTab.timer.play();
		await expect.poll(() => soundingTab.chimes.scheduled).toHaveLength(1);
		await expect.poll(() => otherTab.timer.run.status).toBe('working');

		nowMs = minutes(25);
		soundingTab.audio.currentTime = 1500;
		otherTab.timer.next();

		await expect
			.poll(() => soundingTab.chimes.scheduled)
			.toEqual([expect.objectContaining({ alert: 'break', at: minutes(30), startsAt: 1800 })]);
		expect(otherTab.chimes.scheduled).toEqual([]);
	});

	it('never sounds in a tab no button was pressed in, even when it follows the run', async () => {
		const storage = new InMemoryStorage();
		const pressedTab = openTab(storage);
		const followingTab = openTab(storage);

		pressedTab.timer.play();
		await expect.poll(() => followingTab.timer.run.status).toBe('working');
		await afterPendingWork();

		expect(followingTab.contextsMade()).toBe(0);
		expect(followingTab.chimes.isSounding).toBe(false);
	});

	it('takes the turn once the sounding tab lets it go, with the chime still ahead', async () => {
		const releaseLock = await holdLockElsewhere();
		const tab = openTab(new InMemoryStorage());
		tab.timer.play();
		await afterPendingWork();
		expect(tab.chimes.isSounding).toBe(false);
		expect(tab.chimes.scheduled).toEqual([]);

		nowMs = minutes(10);
		tab.audio.currentTime = 600;
		releaseLock();

		await expect
			.poll(() => tab.chimes.scheduled)
			.toEqual([expect.objectContaining({ alert: 'target', at: minutes(25), startsAt: 1500 })]);
		expect(tab.chimes.isSounding).toBe(true);
	});

	it('never takes the turn when its audio can’t be made, leaving it to a tab that can play', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const storage = new InMemoryStorage();
		const silentTab = openTab(storage, { hasNoAudio: true });
		const playingTab = openTab(storage);

		silentTab.timer.play();
		await expect.poll(() => playingTab.timer.run.status).toBe('working');
		playingTab.timer.pause();
		await expect.poll(() => silentTab.timer.run).toMatchObject({ runningSince: null });
		playingTab.timer.play();

		await expect.poll(() => playingTab.chimes.scheduled).toHaveLength(1);
		expect(silentTab.chimes.isSounding).toBe(false);
	});

	it('never takes the turn when its audio can’t resume, and asks once it can', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const tab = openTab(new InMemoryStorage());
		tab.audio.resumeError = new Error('Not allowed to start');

		tab.timer.play();
		await afterPendingWork();
		expect(tab.chimes.isSounding).toBe(false);

		tab.audio.resumeError = null;
		tab.timer.pause();
		tab.timer.play();

		await expect.poll(() => tab.chimes.scheduled).toHaveLength(1);
		expect(tab.chimes.isSounding).toBe(true);
	});

	it('lets the turn go when its audio later fails, so the next tab sounds', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const storage = new InMemoryStorage();
		const firstTab = openTab(storage);
		const secondTab = openTab(storage);
		firstTab.timer.play();
		await expect.poll(() => firstTab.chimes.isSounding).toBe(true);
		await expect.poll(() => secondTab.timer.run.status).toBe('working');
		secondTab.timer.pause();
		await expect.poll(() => firstTab.timer.run).toMatchObject({ runningSince: null });
		secondTab.timer.play();
		await expect.poll(() => firstTab.timer.run).toMatchObject({ runningSince: 0 });

		nowMs = minutes(25);
		firstTab.audio.currentTime = 1500;
		secondTab.audio.currentTime = 1500;
		firstTab.audio.resumeError = new Error('Interrupted');
		firstTab.timer.next();

		await expect
			.poll(() => secondTab.chimes.scheduled)
			.toEqual([expect.objectContaining({ alert: 'break', at: minutes(30) })]);
		expect(firstTab.chimes.isSounding).toBe(false);
		expect(firstTab.chimes.scheduled).toEqual([]);
	});

	it('leaves the queue when its audio fails while it waits, so it never takes the turn', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const releaseLock = await holdLockElsewhere();
		const tab = openTab(new InMemoryStorage());
		tab.timer.play();
		await expect
			.poll(async () => (await navigator.locks.query()).pending)
			.toContainEqual(expect.objectContaining({ name: lockName }));

		tab.audio.resumeError = new Error('Interrupted');
		tab.timer.pause();
		await expect
			.poll(async () => (await navigator.locks.query()).pending)
			.not.toContainEqual(expect.objectContaining({ name: lockName }));
		releaseLock();
		await afterPendingWork();

		expect(tab.chimes.isSounding).toBe(false);
	});

	it('asks for its turn once, however many buttons are pressed', async () => {
		const requestSpy = vi.spyOn(navigator.locks, 'request');
		const tab = openTab(new InMemoryStorage());

		tab.timer.play();
		tab.timer.pause();
		tab.timer.play();
		await afterPendingWork();

		expect(requestSpy).toHaveBeenCalledOnce();
		expect(tab.audio.resumeCount).toBe(3);
	});

	it('sounds in every pressed tab without the Web Locks API, since tabs can’t take turns', async () => {
		const storage = new InMemoryStorage();
		const firstTab = openTab(storage, { hasNoLocks: true });
		const secondTab = openTab(storage, { hasNoLocks: true });

		firstTab.timer.play();
		await expect.poll(() => secondTab.timer.run.status).toBe('working');
		secondTab.timer.pause();
		await expect.poll(() => firstTab.timer.run).toMatchObject({ runningSince: null });
		secondTab.timer.play();

		await expect.poll(() => firstTab.chimes.scheduled).toHaveLength(1);
		await expect.poll(() => secondTab.chimes.scheduled).toHaveLength(1);
		expect(firstTab.chimes.isSounding).toBe(true);
		expect(secondTab.chimes.isSounding).toBe(true);
	});

	it('records a refused lock in the activity log and sounds anyway', async () => {
		const storage = new InMemoryStorage();
		useErrorLog(storage);
		// The browser refuses lock names that start with a hyphen, which the spec reserves.
		const tab = openTab(storage, { name: '-refused' });

		tab.timer.play();

		await expect.poll(() => tab.chimes.scheduled).toHaveLength(1);
		await expect.poll(() => storage.getLogEntries()).toHaveLength(1);
		expect((await storage.getLogEntries())[0]).toMatchObject({
			type: 'error',
			message: 'Could not take turns with other tabs, so this tab sounds the chimes.'
		});
	});
});
