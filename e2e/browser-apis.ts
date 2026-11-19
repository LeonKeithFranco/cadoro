// Stand-ins for browser APIs a journey can't watch or control for real: the audio the chimes
// play through, the screen wake lock and persistent storage. Each is installed with an init
// script, which runs before the app does, on every page load.

import type { Page } from '@playwright/test';

/** A chime the page started playing, or stopped. */
export type ChimeEvent = {
	/** Whether the chime was scheduled to start, or stopped before it started. */
	kind: 'start' | 'stop';
	/** The chime file it plays, such as `/chimes/bell-ding-2.mp3`, or `null` if it isn't known. */
	file: string | null;
	/**
	 * When it starts, as milliseconds since 1970 on the page's clock, or 0 for at once. The
	 * page's audio clock follows its fake clock while this is installed, so a journey compares it
	 * with the moment the run reaches its target or its break ends. `null` for a stop.
	 */
	whenMs: number | null;
};

/**
 * Records every chime the app schedules, and makes the page's audio clock follow its clock.
 *
 * @remarks
 * Playwright's fake clock doesn't reach Web Audio, whose clock is the machine's, so a chime
 * scheduled for 25 minutes ahead would only show when the machine's own time has passed. This
 * makes `AudioContext.currentTime` read the page's `Date`, which the fake clock does move, so
 * a chime's start is an exact moment on it, and the app's own check for a chime already started
 * agrees with the journey's. Each chime's file is found by tagging the bytes the app fetches,
 * since the decoded sound has no name. Chimes still play for real, but a start far in the future
 * makes no sound.
 *
 * Call it before the page opens.
 *
 * @param page - The page to watch.
 */
export async function recordChimes(page: Page): Promise<void> {
	// Plain JavaScript in a string, since it wraps the browser's own methods, which the linter's
	// rule against reading a method off a prototype can't tell from a bug.
	await page.addInitScript({
		content: `
			window.chimeEvents = [];
			const MS_PER_SECOND = 1000;
			Object.defineProperty(BaseAudioContext.prototype, 'currentTime', {
				configurable: true,
				get: () => Date.now() / MS_PER_SECOND
			});

			const arrayBuffer = Response.prototype.arrayBuffer;
			Response.prototype.arrayBuffer = async function () {
				const bytes = await arrayBuffer.call(this);
				bytes.chimeFile = new URL(this.url).pathname;
				return bytes;
			};

			const decodeAudioData = BaseAudioContext.prototype.decodeAudioData;
			BaseAudioContext.prototype.decodeAudioData = function (data) {
				const file = data.chimeFile;
				return decodeAudioData.call(this, data).then((sound) => {
					sound.chimeFile = file;
					return sound;
				});
			};

			const start = AudioBufferSourceNode.prototype.start;
			AudioBufferSourceNode.prototype.start = function (when) {
				const file = this.buffer?.chimeFile ?? null;
				window.chimeEvents.push({ kind: 'start', file, whenMs: (when ?? 0) * MS_PER_SECOND });
				start.call(this, when);
			};

			const stop = AudioBufferSourceNode.prototype.stop;
			AudioBufferSourceNode.prototype.stop = function (when) {
				const file = this.buffer?.chimeFile ?? null;
				window.chimeEvents.push({ kind: 'stop', file, whenMs: null });
				stop.call(this, when);
			};
		`
	});
}

/**
 * Reads the chimes the app has started or stopped since the page loaded.
 *
 * @param page - A page where {@link recordChimes} was called before it opened.
 * @returns Every event, in the order it happened.
 */
export async function chimeEvents(page: Page): Promise<ChimeEvent[]> {
	return page.evaluate(() => (window as unknown as { chimeEvents: ChimeEvent[] }).chimeEvents);
}

/**
 * Reads the chimes the app has scheduled since the page loaded.
 *
 * @param page - A page where {@link recordChimes} was called before it opened.
 * @returns Every chime started, in order.
 */
export async function chimeStarts(page: Page): Promise<ChimeEvent[]> {
	const events = await chimeEvents(page);
	return events.filter((event) => event.kind === 'start');
}

/** What a journey sees of the screen wake lock. */
export type WakeLockLog = {
	/** How many times the app asked for a lock. */
	requests: number;
	/** How many of the locks it was given it has let go. */
	releases: number;
};

/**
 * Replaces `navigator.wakeLock` with one that grants every request, and counts them, so a
 * journey can see when the app asks for the screen to be kept on and when it lets go.
 *
 * @remarks
 * Call it before the page opens. Without it the browser's own wake lock is used, whose state a
 * journey can't read. Its locks are only ever let go by the app, so nothing listening for their
 * release is ever called.
 *
 * @param page - The page to give the wake lock to.
 */
export async function fakeWakeLock(page: Page): Promise<void> {
	await page.addInitScript(() => {
		const log: WakeLockLog = { requests: 0, releases: 0 };
		(window as unknown as { wakeLockLog: WakeLockLog }).wakeLockLog = log;
		Object.defineProperty(navigator, 'wakeLock', {
			configurable: true,
			value: {
				request: (): Promise<{
					release: () => Promise<void>;
					addEventListener: () => void;
				}> => {
					log.requests++;
					return Promise.resolve({
						release: (): Promise<void> => {
							log.releases++;
							return Promise.resolve();
						},
						addEventListener: (): void => {}
					});
				}
			}
		});
	});
}

/**
 * Removes `navigator.wakeLock`, as in a browser without the Screen Wake Lock API.
 *
 * @remarks
 * Call it before the page opens.
 *
 * @param page - The page to take the wake lock from.
 */
export async function removeWakeLock(page: Page): Promise<void> {
	await page.addInitScript(() => {
		Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: undefined });
	});
}

/**
 * Reads how often the app asked for the wake lock and let it go.
 *
 * @param page - A page where {@link fakeWakeLock} was called before it opened.
 * @returns The counts so far.
 */
export async function wakeLockLog(page: Page): Promise<WakeLockLog> {
	return page.evaluate(() => (window as unknown as { wakeLockLog: WakeLockLog }).wakeLockLog);
}

/**
 * Shows or hides the page as the browser does when its tab is switched away from, which also
 * makes the browser drop the wake lock.
 *
 * @param page - The page to show or hide.
 * @param state - `hidden` or `visible`.
 */
export async function setVisibility(page: Page, state: 'hidden' | 'visible'): Promise<void> {
	await page.evaluate((visibilityState) => {
		Object.defineProperty(document, 'visibilityState', {
			configurable: true,
			get: () => visibilityState
		});
		document.dispatchEvent(new Event('visibilitychange'));
	}, state);
}

/**
 * Replaces persistent storage's answers, since a real browser decides on its own whether to
 * grant it, which a journey can't control.
 *
 * @remarks
 * Call it before the page opens.
 *
 * @param page - The page to give the storage manager to.
 * @param options - `isPersistent`, whether storage is persistent to begin with, and
 * `willGrant`, whether a request for it is granted.
 */
export async function fakePersistentStorage(
	page: Page,
	options: { isPersistent: boolean; willGrant: boolean }
): Promise<void> {
	await page.addInitScript((fake) => {
		let isPersistent = fake.isPersistent;
		Object.defineProperty(navigator.storage, 'persisted', {
			configurable: true,
			value: (): Promise<boolean> => Promise.resolve(isPersistent)
		});
		Object.defineProperty(navigator.storage, 'persist', {
			configurable: true,
			value: (): Promise<boolean> => {
				isPersistent = isPersistent || fake.willGrant;
				return Promise.resolve(isPersistent);
			}
		});
	}, options);
}
