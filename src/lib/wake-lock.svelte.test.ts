import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tick } from 'svelte';
import { useErrorLog } from './error-log';
import { DEFAULT_SETTINGS } from './settings';
import { SettingsSession } from './settings.svelte';
import { InMemoryStorage } from './storage/in-memory-storage';
import { minutes } from './testing/durations';
import { foreverRoutine } from './testing/routines';
import { storageHolding } from './testing/storage';
import { testSessionOptions } from './testing/timer-session';
import { TimerSession } from './timer.svelte';
import {
	WakeLockKeeper,
	type PageVisibility,
	type ScreenLock,
	type WakeLockApi
} from './wake-lock.svelte';

/** The fake clock's current moment, in milliseconds since 1970, which each test moves by hand. */
let nowMs = 0;

/**
 * A lock the fake browser granted, which remembers whether it was released, and tells its
 * listeners when it is, as a `WakeLockSentinel`'s `release` event does.
 */
class FakeLock implements ScreenLock {
	/** Whether the lock was released. */
	isReleased = false;
	/** Everything listening for the lock to be released. */
	readonly #releaseListeners: (() => void)[] = [];

	release(): Promise<void> {
		this.#letGo();
		return Promise.resolve();
	}

	addEventListener(_type: 'release', listener: () => void): void {
		this.#releaseListeners.push(listener);
	}

	/** Lets the lock go by the browser's own choice, as when the system's battery saver starts. */
	dropByBrowser(): void {
		this.#letGo();
	}

	/** Marks the lock released and tells the listeners, once. */
	#letGo(): void {
		if (this.isReleased) {
			return;
		}
		this.isReleased = true;
		for (const listener of this.#releaseListeners) {
			listener();
		}
	}
}

/** A fake `navigator.wakeLock`, which grants every request and keeps what it granted. */
class FakeWakeLock implements WakeLockApi {
	/** Every lock granted, in order. */
	readonly locks: FakeLock[] = [];
	/** The error the next requests are refused with, or `null` to grant them. */
	refusal: Error | null = null;

	/** Whether requests wait for {@link FakeWakeLock.grantWaiting} rather than being granted at once. */
	isSlow = false;
	/** The requests waiting to be granted, when slow. */
	readonly #waiting: (() => void)[] = [];

	request(type: 'screen'): Promise<ScreenLock> {
		expect(type).toBe('screen');
		if (this.refusal !== null) {
			return Promise.reject(this.refusal);
		}
		const lock = new FakeLock();
		if (!this.isSlow) {
			this.locks.push(lock);
			return Promise.resolve(lock);
		}
		return new Promise<ScreenLock>((resolve) => {
			this.#waiting.push(() => {
				this.locks.push(lock);
				resolve(lock);
			});
		});
	}

	/** Grants the requests that were waiting, as the browser does a moment after they're made. */
	grantWaiting(): void {
		for (const grant of this.#waiting.splice(0)) {
			grant();
		}
	}

	/**
	 * Lists the locks held now.
	 *
	 * @returns The granted locks that weren't released.
	 */
	get held(): FakeLock[] {
		return this.locks.filter((lock) => !lock.isReleased);
	}
}

/** A fake page whose visibility the test changes, as hiding the tab does. */
class FakePage extends EventTarget implements PageVisibility {
	/** `visible` or `hidden`. */
	visibilityState = 'visible';

	/**
	 * Shows or hides the page, and tells the listeners.
	 *
	 * @param state - The new visibility.
	 */
	show(state: 'visible' | 'hidden'): void {
		this.visibilityState = state;
		this.dispatchEvent(new Event('visibilitychange'));
	}
}

/** What a test follows: the browser's lock, the page, and the sessions the keeper follows. */
type Setup = {
	/** The fake browser lock. */
	readonly wakeLock: FakeWakeLock;
	/** The fake page. */
	readonly page: FakePage;
	/** The timer session. */
	readonly timer: TimerSession;
	/** The settings session. */
	readonly settings: SettingsSession;
	/** The keeper under test. */
	readonly keeper: WakeLockKeeper;
};

/**
 * Starts a keeper following a fresh timer and settings, on a visible page.
 *
 * @param options - `isSupported`, false for a browser without the wake lock API.
 * @returns What the test follows and controls, with the setting on, as it is by default.
 */
function setUp({ isSupported = true }: { isSupported?: boolean } = {}): Setup {
	const storage = storageHolding([foreverRoutine]);
	const wakeLock = new FakeWakeLock();
	const page = new FakePage();
	const settings = new SettingsSession(storage, DEFAULT_SETTINGS);
	const timer = new TimerSession(
		[foreverRoutine],
		testSessionOptions(() => nowMs, storage),
		{ saved: null, isAnotherTabOpen: false }
	);
	const keeper = new WakeLockKeeper({
		timer,
		settings,
		wakeLock: isSupported ? wakeLock : undefined,
		page
	});
	return { wakeLock, page, timer, settings, keeper };
}

/**
 * Waits for every effect and request already started to finish, so a test can check that
 * something didn't happen.
 *
 * @returns A promise that settles after a few of the browser's tasks.
 */
async function afterPendingWork(): Promise<void> {
	await new Promise<void>((resolve) => {
		setTimeout(resolve, 50);
	});
}

// Starts each test at the fake clock's 0.
beforeEach(() => {
	nowMs = 0;
});

// Puts back what a test spied on, and takes away the log a test chose for errors.
afterEach(() => {
	useErrorLog(null);
	vi.restoreAllMocks();
});

describe('keeping the screen awake during a run', () => {
	it('asks for nothing before a run is counting', async () => {
		const { wakeLock } = setUp();

		await afterPendingWork();

		expect(wakeLock.locks).toEqual([]);
	});

	it('holds the lock while work counts', async () => {
		const { wakeLock, timer } = setUp();

		timer.play();

		await expect.poll(() => wakeLock.held).toHaveLength(1);
	});

	it('keeps the same lock while the timer ticks', async () => {
		const { wakeLock, timer } = setUp();
		timer.play();
		await expect.poll(() => wakeLock.held).toHaveLength(1);

		nowMs = minutes(1);
		timer.tick();
		await afterPendingWork();

		expect(wakeLock.locks).toHaveLength(1);
	});

	it('releases the lock on Pause, and asks again on Play', async () => {
		const { wakeLock, timer } = setUp();
		timer.play();
		await expect.poll(() => wakeLock.held).toHaveLength(1);

		timer.pause();
		await expect.poll(() => wakeLock.held).toHaveLength(0);
		timer.play();

		await expect.poll(() => wakeLock.held).toHaveLength(1);
		expect(wakeLock.locks).toHaveLength(2);
	});

	it('keeps the lock through the break, which counts too', async () => {
		const { wakeLock, timer } = setUp();
		timer.play();
		await expect.poll(() => wakeLock.held).toHaveLength(1);

		nowMs = minutes(25);
		timer.next();
		await afterPendingWork();

		expect(wakeLock.held).toHaveLength(1);
	});

	it('releases the lock when the run ends', async () => {
		const { wakeLock, timer } = setUp();
		timer.play();
		await expect.poll(() => wakeLock.held).toHaveLength(1);

		timer.finish();

		await expect.poll(() => wakeLock.held).toHaveLength(0);
	});

	it('does not ask while the setting is off', async () => {
		const { wakeLock, timer, settings } = setUp();
		await settings.save({ keepScreenAwake: false });

		timer.play();
		await afterPendingWork();

		expect(wakeLock.locks).toEqual([]);
	});

	it('releases the lock when the setting is turned off mid-run, and asks again when it is turned on', async () => {
		const { wakeLock, timer, settings } = setUp();
		timer.play();
		await expect.poll(() => wakeLock.held).toHaveLength(1);

		await settings.save({ keepScreenAwake: false });
		await expect.poll(() => wakeLock.held).toHaveLength(0);
		await settings.save({ keepScreenAwake: true });

		await expect.poll(() => wakeLock.held).toHaveLength(1);
	});
});

describe('the page being hidden and shown', () => {
	it('releases the lock when the page is hidden, and asks again when it is visible', async () => {
		const { wakeLock, timer, page } = setUp();
		timer.play();
		await expect.poll(() => wakeLock.held).toHaveLength(1);

		page.show('hidden');
		await expect.poll(() => wakeLock.held).toHaveLength(0);
		page.show('visible');

		await expect.poll(() => wakeLock.held).toHaveLength(1);
		expect(wakeLock.locks).toHaveLength(2);
	});

	it('does not ask for a lock while the page is hidden, such as when a run starts in the background', async () => {
		const { wakeLock, timer, page } = setUp();
		page.show('hidden');

		timer.play();
		await afterPendingWork();

		expect(wakeLock.locks).toEqual([]);
	});

	it('does not ask when the page is shown while no timer is counting', async () => {
		const { wakeLock, page } = setUp();

		page.show('hidden');
		page.show('visible');
		await afterPendingWork();

		expect(wakeLock.locks).toEqual([]);
	});
});

describe('the browser letting the lock go by itself', () => {
	it('asks again while the page stays visible and a timer counts', async () => {
		const { wakeLock, timer } = setUp();
		timer.play();
		await expect.poll(() => wakeLock.held).toHaveLength(1);

		wakeLock.locks[0]?.dropByBrowser();

		await expect.poll(() => wakeLock.held).toHaveLength(1);
		expect(wakeLock.locks).toHaveLength(2);
	});

	it('keeps asking each time the browser lets go', async () => {
		const { wakeLock, timer } = setUp();
		timer.play();
		await expect.poll(() => wakeLock.held).toHaveLength(1);

		wakeLock.locks[0]?.dropByBrowser();
		await expect.poll(() => wakeLock.locks).toHaveLength(2);
		wakeLock.locks[1]?.dropByBrowser();

		await expect.poll(() => wakeLock.locks).toHaveLength(3);
		expect(wakeLock.held).toHaveLength(1);
	});

	it('does not ask again when the browser lets go as the page is hidden', async () => {
		const { wakeLock, timer, page } = setUp();
		timer.play();
		await expect.poll(() => wakeLock.held).toHaveLength(1);

		// The browser lets the lock go as it hides the page, before telling the page.
		page.visibilityState = 'hidden';
		wakeLock.locks[0]?.dropByBrowser();
		await afterPendingWork();

		expect(wakeLock.locks).toHaveLength(1);
	});

	it('does not ask again after letting the lock go itself, as on Pause', async () => {
		const { wakeLock, timer } = setUp();
		timer.play();
		await expect.poll(() => wakeLock.held).toHaveLength(1);

		timer.pause();
		await afterPendingWork();

		expect(wakeLock.locks).toHaveLength(1);
		expect(wakeLock.held).toEqual([]);
	});
});

describe('a browser without the wake lock API', () => {
	it('says it is not supported, and the run works the same', async () => {
		const { keeper, timer } = setUp({ isSupported: false });

		timer.play();
		await afterPendingWork();

		expect(keeper.isSupported).toBe(false);
		expect(timer.view.isRunning).toBe(true);
	});

	it('says it is supported when the browser has it', () => {
		const { keeper } = setUp();

		expect(keeper.isSupported).toBe(true);
	});
});

describe('the browser refusing', () => {
	it('records a refused request in the activity log and carries on, asking again on the next Play', async () => {
		const log = new InMemoryStorage();
		useErrorLog(log);
		const { wakeLock, timer } = setUp();
		wakeLock.refusal = new Error('Low battery');

		timer.play();
		await expect.poll(() => log.getLogEntries()).toHaveLength(1);
		expect((await log.getLogEntries())[0]).toMatchObject({
			type: 'error',
			message: 'Could not keep the screen on.',
			details: { message: 'Low battery' }
		});
		wakeLock.refusal = null;
		timer.pause();
		await tick();
		timer.play();

		await expect.poll(() => wakeLock.held).toHaveLength(1);
		expect(timer.view.isRunning).toBe(true);
	});

	it('releases a lock granted after the run was paused', async () => {
		const { wakeLock, timer } = setUp();
		wakeLock.isSlow = true;

		timer.play();
		await tick();
		timer.pause();
		await tick();
		wakeLock.grantWaiting();

		await expect.poll(() => wakeLock.locks).toHaveLength(1);
		await expect.poll(() => wakeLock.held).toHaveLength(0);
	});

	it('records a lock that cannot be released in the activity log', async () => {
		const log = new InMemoryStorage();
		useErrorLog(log);
		const { wakeLock, timer } = setUp();
		timer.play();
		await expect.poll(() => wakeLock.held).toHaveLength(1);
		const failure = new Error('Already gone');
		vi.spyOn(wakeLock.locks[0] as FakeLock, 'release').mockRejectedValue(failure);

		timer.pause();

		await expect.poll(() => log.getLogEntries()).toHaveLength(1);
		expect((await log.getLogEntries())[0]).toMatchObject({
			type: 'error',
			message: 'Could not release the screen lock.',
			details: { message: 'Already gone' }
		});
	});
});
