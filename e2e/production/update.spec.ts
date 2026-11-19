import { expect, test, type Locator, type Page } from '@playwright/test';
import { waitForActiveWorker } from '../service-worker.ts';
import { NEXT_VERSION_COOKIE } from '../update-server.ts';

/**
 * Opens the app with its service worker in control of the page, as an installed app is whenever
 * it opens.
 *
 * @remarks
 * On a first visit, the page loaded before the worker existed, so it isn't controlled, and a new
 * version would take over at once instead of waiting. A reload brings the page under the worker.
 *
 * @param page - A new page, which opens the app.
 */
async function openControlledApp(page: Page): Promise<void> {
	await page.goto('');
	await waitForActiveWorker(page);
	await page.reload();
	await expect
		.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null), {
			message: 'the service worker controls the page'
		})
		.toBe(true);
}

/**
 * Has the update server send this test's browser a new version, and the page look for it, as the
 * browser does when the app opens, then waits until the new version is installed and waiting.
 *
 * @param page - A page of the app, controlled by its service worker.
 */
async function findNewVersion(page: Page): Promise<void> {
	const origin = new URL(page.url()).origin;
	await page.context().addCookies([{ ...NEXT_VERSION_COOKIE, url: origin }]);
	await page.evaluate(async () => {
		const registration = await navigator.serviceWorker.getRegistration();
		await registration?.update();
	});
	await expect
		.poll(() => isNewVersionWaiting(page), { message: 'a new version is waiting' })
		.toBe(true);
}

/**
 * Checks whether a new version of the service worker is installed and waiting.
 *
 * @param page - A page of the app.
 * @returns Whether a new version is waiting to take over.
 */
function isNewVersionWaiting(page: Page): Promise<boolean> {
	return page.evaluate(async () => {
		const registration = await navigator.serviceWorker.getRegistration();
		return registration?.waiting != null;
	});
}

/**
 * Finishes the run in progress, confirming it, and closes its summary.
 *
 * @param page - A page of the app, on the Timer screen with a run in progress.
 */
async function finishRun(page: Page): Promise<void> {
	await page.getByRole('button', { name: 'Finish' }).click();
	await page
		.getByRole('dialog', { name: 'Finish this run?' })
		.getByRole('button', { name: 'Finish' })
		.click();
	await page.getByRole('button', { name: 'Done' }).click();
}

/**
 * How long Reload has to load the page again, in milliseconds: the same as `expect`'s own limit,
 * so a Reload that does nothing fails as quickly, rather than at the test's 30-second timeout.
 */
const RELOAD_TIMEOUT_MS = 5_000;

/**
 * Presses Reload on the update offer, and waits for the page to load again.
 *
 * @param page - A page of the app, showing the offer.
 */
async function pressReload(page: Page): Promise<void> {
	const reloaded = page.waitForEvent('load', { timeout: RELOAD_TIMEOUT_MS });
	await page.getByRole('button', { name: 'Reload' }).click();
	await reloaded;
}

/**
 * Finds the update offer on a page.
 *
 * @param page - A page of the app.
 * @returns The offer's message, inside the status region.
 */
function updateOffer(page: Page): Locator {
	return page.getByRole('status').getByText('A new version is ready.');
}

test.describe('a new version of the app', () => {
	test('waits while a run is in progress, then takes over on Reload', async ({ page }) => {
		const offer = updateOffer(page);
		await openControlledApp(page);

		await test.step('found before a run, it offers to reload', async () => {
			await findNewVersion(page);

			await expect(offer).toBeVisible();
		});

		await test.step('during a run, the offer is put away', async () => {
			await page.getByRole('button', { name: 'Play' }).click();

			await expect(offer).toBeHidden();
		});

		await test.step('once the run ends, it offers to reload again', async () => {
			await finishRun(page);

			await expect(offer).toBeVisible();
		});

		await test.step('Reload hands over to it and reloads the page', async () => {
			await pressReload(page);

			await expect(page.getByRole('heading', { level: 1, name: 'Timer' })).toBeVisible();
			expect(await isNewVersionWaiting(page)).toBe(false);
			await expect(offer).toBeHidden();
		});
	});

	test('is offered again the next time the app opens, after Later', async ({ page }) => {
		const offer = updateOffer(page);
		await openControlledApp(page);
		await findNewVersion(page);
		await expect(offer).toBeVisible();

		await page.getByRole('button', { name: 'Later' }).click();
		await expect(offer).toBeHidden();

		await page.reload();
		await expect(offer).toBeVisible();
	});

	test('with the app in two tabs, both wait for the shared run to end, then reload together', async ({
		page
	}) => {
		const firstTab = page;
		const secondTab = await page.context().newPage();
		await openControlledApp(firstTab);
		await secondTab.goto('');
		await firstTab.getByRole('button', { name: 'Play' }).click();
		await expect(secondTab.getByRole('button', { name: 'Pause' })).toBeVisible();
		await findNewVersion(secondTab);

		const navigations: string[] = [];
		firstTab.on('framenavigated', (frame) => navigations.push(frame.url()));
		secondTab.on('framenavigated', (frame) => navigations.push(frame.url()));

		await test.step('while the shared run is in progress, neither tab offers to reload', async () => {
			await expect(updateOffer(firstTab)).toBeHidden();
			await expect(updateOffer(secondTab)).toBeHidden();
			expect(navigations).toEqual([]);
		});

		await test.step('once the run ends, both tabs offer to reload', async () => {
			await finishRun(firstTab);

			await expect(updateOffer(firstTab)).toBeVisible();
			await expect(updateOffer(secondTab)).toBeVisible();
		});

		await test.step('Reload in one tab reloads both', async () => {
			const firstTabReloaded = firstTab.waitForEvent('load', { timeout: RELOAD_TIMEOUT_MS });

			await pressReload(secondTab);
			await firstTabReloaded;

			await expect(firstTab.getByRole('heading', { level: 1, name: 'Timer' })).toBeVisible();
			await expect(secondTab.getByRole('heading', { level: 1, name: 'Timer' })).toBeVisible();
		});
	});
});
