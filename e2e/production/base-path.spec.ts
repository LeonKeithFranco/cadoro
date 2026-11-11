import { expect, test, type Page } from '@playwright/test';

/**
 * The folder the production project serves the app from, as `playwright.config.ts` sets it.
 *
 * @remarks
 * Tests navigate with paths relative to the project's `baseURL`, such as `goto('stats')`, because
 * Playwright resolves `/stats` against the host and would drop this folder.
 */
const BASE_PATH = '/cadoro';

/** A screen the tests visit. */
type Screen = {
	/** The screen's name: its link and its heading. */
	name: string;
	/** The screen's path inside the app, relative to the base path. */
	path: string;
};

/** Every screen other than the Timer, which the app opens on. */
const OTHER_SCREENS: Screen[] = [
	{ name: 'Routines', path: 'routines' },
	{ name: 'Stats', path: 'stats' },
	{ name: 'Settings', path: 'settings' }
];

/**
 * Starts recording every response the page gets with an error status, such as a 404 for a file
 * that ignores the base path.
 *
 * @param page - The browser page to watch.
 * @returns The list of failed responses, as `"404 http://…"`, which grows as the page loads more.
 */
function recordFailedResponses(page: Page): string[] {
	const failures: string[] = [];
	page.on('response', (response) => {
		if (!response.ok()) {
			failures.push(`${response.status()} ${response.url()}`);
		}
	});
	return failures;
}

test('every screen opens from its link under the base path', async ({ page }) => {
	const failures = recordFailedResponses(page);
	const navigation = page.getByRole('navigation', { name: 'Screens' });

	await page.goto('');
	await expect(page).toHaveURL(`${BASE_PATH}/`);
	await expect(page.getByRole('heading', { level: 1, name: 'Timer' })).toBeVisible();

	for (const screen of OTHER_SCREENS) {
		await navigation.getByRole('link', { name: screen.name }).click();

		await expect(page).toHaveURL(`${BASE_PATH}/${screen.path}`);
		await expect(page.getByRole('heading', { level: 1, name: screen.name })).toBeVisible();
	}
	expect(failures).toEqual([]);
});

test("a screen's address opens that screen directly and after a reload", async ({ page }) => {
	const failures = recordFailedResponses(page);
	const statsHeading = page.getByRole('heading', { level: 1, name: 'Stats' });

	await page.goto('stats');
	await expect(statsHeading).toBeVisible();

	await page.reload();
	await expect(page).toHaveURL(`${BASE_PATH}/stats`);
	await expect(statsHeading).toBeVisible();
	expect(failures).toEqual([]);
});
