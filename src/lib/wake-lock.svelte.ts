// Keeps the screen on while a run is counting, with the Screen Wake Lock API, when the setting
// allows it. The browser drops the lock whenever the page is hidden, so the lock is asked for again
// when the page is visible.

import { recordError } from './error-log';
import type { RunView } from './run';
import type { Settings } from './settings';

/** A held screen wake lock, as the browser's `WakeLockSentinel` is. */
export type ScreenLock = {
	/**
	 * Gives the lock back, so the screen may turn off again.
	 *
	 * @returns A promise that settles once the lock is released, and rejects if the browser can't.
	 */
	release(): Promise<void>;
	/**
	 * Calls a function once the lock is let go, whether by {@link ScreenLock.release} or by the
	 * browser itself, as when the page is hidden or the system's battery saver starts.
	 *
	 * @param type - The event, always `release`.
	 * @param listener - The function to call.
	 */
	addEventListener(type: 'release', listener: () => void): void;
};

/**
 * The parts of the browser's `WakeLock`, `navigator.wakeLock`, that keeping the screen on uses,
 * so tests can pass a fake one.
 */
export type WakeLockApi = {
	/**
	 * Asks the browser to keep the screen on.
	 *
	 * @param type - What to keep on, always `screen`.
	 * @returns A promise of the held lock, which rejects when the browser refuses, such as when the
	 * page is hidden or the battery is low.
	 */
	request(type: 'screen'): Promise<ScreenLock>;
};

/**
 * The parts of the page, `document`, that say whether it's visible, so tests can pass a fake one.
 */
export type PageVisibility = {
	/** Whether the page is `visible` or `hidden`, as `document.visibilityState` says. */
	readonly visibilityState: string;
	/**
	 * Calls a function whenever the page is shown or hidden.
	 *
	 * @param type - The event, always `visibilitychange`.
	 * @param listener - The function to call.
	 */
	addEventListener(type: 'visibilitychange', listener: () => void): void;
};

/** What {@link WakeLockKeeper} follows and needs, passed in so tests can control it. */
export type WakeLockKeeperOptions = {
	/** The timer session, whose view says whether a timer is counting. */
	readonly timer: { readonly view: Pick<RunView, 'isRunning'> };
	/** The settings session, whose `keepScreenAwake` allows keeping the screen on. */
	readonly settings: { readonly settings: Pick<Settings, 'keepScreenAwake'> };
	/**
	 * The browser's wake lock, `navigator.wakeLock`, or `undefined` where the browser has none, as
	 * outside HTTPS and `localhost`, and in some browsers.
	 */
	readonly wakeLock: WakeLockApi | undefined;
	/** The page, whose visibility decides when the lock can be asked for. */
	readonly page: PageVisibility;
};

/**
 * Keeps the screen on while a timer counts, for as long as the setting allows and the page is
 * visible.
 *
 * @remarks
 * The lock is asked for when a work period or break is counting, which the run's view says, the
 * setting is on and the page is visible. It's released when the timer stops, such as on Pause or
 * when the run ends, when the setting is turned off, and when the page is hidden, where the
 * browser drops it anyway. It's asked for again when the page is visible again, and when the
 * browser lets it go by itself while the page stays visible, as when the battery saver starts. A
 * refusal from the browser is logged, and the app carries on, since the screen turning off is no
 * failure.
 */
export class WakeLockKeeper {
	/** Whether the page is visible. State, so showing the page asks for the lock again. */
	#isVisible: boolean = $state(false);

	/** Whether the browser has a wake lock. */
	readonly #isSupported: boolean;

	/**
	 * Starts following the timer, the setting and the page's visibility.
	 *
	 * @param options - The timer and settings sessions to follow, the browser's wake lock and the
	 * page, as {@link WakeLockKeeperOptions} describes them.
	 */
	constructor({ timer, settings, wakeLock, page }: WakeLockKeeperOptions) {
		this.#isSupported = wakeLock !== undefined;
		this.#isVisible = page.visibilityState === 'visible';
		page.addEventListener('visibilitychange', () => {
			this.#isVisible = page.visibilityState === 'visible';
		});

		// The root keeps the effect running outside any component, for as long as the app is open.
		$effect.root(() => {
			// Derived, so the effect restarts only when whether to hold changes, not on each tick.
			const shouldHold = $derived(
				settings.settings.keepScreenAwake && timer.view.isRunning && this.#isVisible
			);

			$effect(() => {
				if (!shouldHold || wakeLock === undefined) {
					return;
				}
				return holdScreenOn(wakeLock, page);
			});
		});
	}

	/** Whether the browser can keep the screen on, which Settings says when it can't. */
	get isSupported(): boolean {
		return this.#isSupported;
	}
}

/**
 * Asks the browser to keep the screen on until told to let go, asking again whenever the browser
 * lets the lock go by itself while the page is visible.
 *
 * @remarks
 * A lock the browser drops as it hides the page isn't asked for again here, since the page is
 * hidden by then, and the keeper asks once the page is visible.
 *
 * @param wakeLock - The browser's wake lock.
 * @param page - The page, whose visibility says whether asking again can work.
 * @returns A function that releases the lock, even if the browser grants it after the function is
 * called. A refusal or a failed release is logged.
 */
function holdScreenOn(wakeLock: WakeLockApi, page: PageVisibility): () => void {
	let isReleased = false;
	let held: ScreenLock | null = null;

	/** Asks for the lock, and again each time the browser lets it go while it's still wanted. */
	const ask = (): void => {
		wakeLock.request('screen').then(
			(lock) => {
				if (isReleased) {
					releaseAndLog(lock);
					return;
				}
				held = lock;
				lock.addEventListener('release', () => {
					const isDroppedByBrowser = !isReleased && held === lock;
					if (isDroppedByBrowser && page.visibilityState === 'visible') {
						held = null;
						ask();
					}
				});
			},
			(error: unknown) => {
				void recordError('Could not keep the screen on.', error);
			}
		);
	};
	ask();

	return (): void => {
		isReleased = true;
		if (held !== null) {
			releaseAndLog(held);
		}
	};
}

/**
 * Releases a lock, logging a failure.
 *
 * @param lock - The lock to release.
 */
function releaseAndLog(lock: ScreenLock): void {
	lock.release().catch((error: unknown) => {
		void recordError('Could not release the screen lock.', error);
	});
}
