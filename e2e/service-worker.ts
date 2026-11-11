// Waiting on the app's service worker in the production journeys.

import { expect, type Page } from '@playwright/test';

/**
 * Waits until the page's service worker is active, which it only becomes once every file it keeps
 * is cached.
 *
 * @remarks
 * A missing worker fails within `expect.poll`'s 5 seconds, with a message that says so, rather
 * than hanging until the test times out.
 *
 * @param page - A page of the app, already open.
 */
export async function waitForActiveWorker(page: Page): Promise<void> {
	await expect
		.poll(
			() =>
				page.evaluate(async () => {
					const registration = await navigator.serviceWorker.getRegistration();
					return registration?.active?.state;
				}),
			{ message: 'a service worker becomes active' }
		)
		.toBe('activated');
}
