// A controlled clock for journeys that run the timer, so they move through minutes of work in an
// instant and check exact times.

import type { Locator, Page } from '@playwright/test';
import { minutes } from '../src/lib/testing/durations';

/** The moment the clock starts at, while the page loads: 9am UTC on a Tuesday. */
const LOADING_TIME_MS = Date.parse('2026-11-10T09:00:00Z');

/** How far past the loading time the clock is paused once the page has loaded. */
const PAUSE_AFTER_LOADING_MS = minutes(1);

/**
 * The longest SvelteKit waits before following a link, in milliseconds: its fallback when the
 * browser doesn't repaint sooner.
 */
const NAVIGATION_WAIT_MS = 100;

/**
 * Opens a page of the app on a fake clock, then stops the clock, so time only passes when the
 * test moves it on with `page.clock.fastForward()`.
 *
 * @remarks
 * Following Playwright's advice, the clock runs while the page loads, so nothing in the app waits
 * forever on a stopped timer, and only pauses once it has loaded, a little later than it started.
 * A run's times then depend only on how far the test moves the clock, not on how fast the machine
 * is.
 *
 * @param page - The page to open the app in.
 * @param path - The app's path to open, such as `/`.
 */
export async function openOnPausedClock(page: Page, path: string): Promise<void> {
	await page.clock.install({ time: LOADING_TIME_MS });
	await page.goto(path);
	await page.clock.pauseAt(LOADING_TIME_MS + PAUSE_AFTER_LOADING_MS);
}

/**
 * Clicks a link to another screen while the clock is paused, and lets the clock run just long
 * enough for SvelteKit to follow it.
 *
 * @remarks
 * Before following a link, SvelteKit lets the browser repaint, by waiting for
 * `requestAnimationFrame` then `setTimeout`, or a 100 ms `setTimeout` at most. The fake clock
 * fakes both, so on a paused clock the link is never followed. Running the clock for those 100 ms
 * fires them. A run counting meanwhile gains 100 ms, which the timer's whole seconds don't show.
 *
 * @param page - The page the link is on.
 * @param link - The link to click.
 */
export async function followLink(page: Page, link: Locator): Promise<void> {
	await link.click();
	await page.clock.runFor(NAVIGATION_WAIT_MS);
}
