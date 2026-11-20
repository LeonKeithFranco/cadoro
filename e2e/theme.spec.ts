import { expect, test, type Page } from '@playwright/test';
import { expectAppRendered, openApp, seedSettings } from './screens';
import { saveSettingsRow } from './storage';

/**
 * Loads only the app's HTML page, refusing every script, style and other file it asks for, so
 * the app never starts. What shows is then what the page itself decided before the app loaded.
 *
 * @param page - The page to load the document in, which has opened the app before, so its
 * localStorage holds the theme's mirror.
 */
async function reloadWithoutTheApp(page: Page): Promise<void> {
	await page.route(
		(url) => url.pathname !== '/',
		(route) => route.abort()
	);
	await page.reload();
}

test.describe('the theme', () => {
	test('is dark on a first visit, even on a device set to light', async ({ page }) => {
		await page.emulateMedia({ colorScheme: 'light' });

		await openApp(page);

		await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
		// Tailwind's zinc-950, which Chromium reports in the colour space Tailwind wrote it in.
		await expect(page.locator('body')).toHaveCSS('background-color', /^oklch\(0\.141 /);
		await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#09090b');
	});

	test('shows a saved light theme with white colours, after a reload', async ({ page }) => {
		await openApp(page);

		await seedSettings(page, { theme: 'light' });

		await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
		await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
		await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#ffffff');
		await expectAppRendered(page);
	});

	test('shows a saved light theme before the app has loaded, so it never flashes dark', async ({
		page
	}) => {
		await openApp(page);
		// This reload reads the row, which refreshes the mirror in localStorage.
		await seedSettings(page, { theme: 'light' });
		await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

		await reloadWithoutTheApp(page);

		await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
		await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#ffffff');
	});

	test('shows a saved dark theme on a light device before the app has loaded', async ({ page }) => {
		await page.emulateMedia({ colorScheme: 'light' });
		await openApp(page);
		await seedSettings(page, { theme: 'dark' });
		await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

		await reloadWithoutTheApp(page);

		await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
	});

	test('shows a saved system theme as the device has it before the app has loaded', async ({
		page
	}) => {
		await page.emulateMedia({ colorScheme: 'light' });
		await openApp(page);
		await seedSettings(page, { theme: 'system' });
		await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

		await reloadWithoutTheApp(page);

		await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
	});

	test('follows the device when the theme is system, live', async ({ page }) => {
		await openApp(page);
		await saveSettingsRow(page, { theme: 'system' });
		await page.emulateMedia({ colorScheme: 'dark' });
		await page.reload();
		await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

		await page.emulateMedia({ colorScheme: 'light' });

		await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
	});

	test('stays dark before the app has loaded when nothing is saved', async ({ page }) => {
		await page.emulateMedia({ colorScheme: 'light' });
		await openApp(page);
		await page.evaluate(() => {
			localStorage.clear();
		});

		await reloadWithoutTheApp(page);

		await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
	});
});
