// Moving between the app's screens and setting them up, shared by the journeys.

import { expect, type Locator, type Page } from '@playwright/test';
import type { Settings } from '../src/lib/settings';
import { saveSettingsRow } from './storage';

/** The name of a screen in the navigation: its link and its heading. */
export type ScreenName = 'Timer' | 'Routines' | 'Stats' | 'Settings';

/**
 * Finds a screen's link in the navigation.
 *
 * @param page - A page of the app.
 * @param name - The screen's name.
 * @returns The link, which the journey clicks, or hands to `followLink` on a paused clock.
 */
export function screenLink(page: Page, name: ScreenName): Locator {
	return page.getByRole('navigation', { name: 'Screens' }).getByRole('link', { name });
}

/**
 * Opens the Settings screen by its address, and waits until it shows.
 *
 * @param page - The page to open it in.
 */
export async function openSettings(page: Page): Promise<void> {
	await page.goto('/settings');
	await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
}

/**
 * Waits until the app has rendered, which it does once its database is open and upgraded, so a
 * journey can then write to the database.
 *
 * @param page - A page that has started to load the app.
 */
export async function expectAppRendered(page: Page): Promise<void> {
	await expect(page.getByRole('navigation', { name: 'Screens' })).toBeVisible();
}

/**
 * Opens the app on the Timer screen and waits until it has rendered.
 *
 * @param page - The page to open the app in.
 */
export async function openApp(page: Page): Promise<void> {
	await page.goto('/');
	await expectAppRendered(page);
}

/**
 * Saves chosen settings in the database of an app that is open, then reloads, so the app reads
 * them as it opens.
 *
 * @remarks
 * The clock, if the journey faked one, carries on across the reload.
 *
 * @param page - A page that has started to load the app.
 * @param row - The settings row, holding only the settings to change from their defaults.
 */
export async function seedSettings(page: Page, row: Partial<Settings>): Promise<void> {
	await expectAppRendered(page);
	await saveSettingsRow(page, row);
	await page.reload();
}

/**
 * Finds the list of routines on the Routines screen.
 *
 * @param page - A page of the app, on the Routines screen.
 * @returns The list.
 */
export function routineList(page: Page): Locator {
	return page.getByRole('list', { name: 'Routines' });
}

/**
 * Creates a routine on the Routines screen, and waits until its card is listed.
 *
 * @param page - A page of the app, on the Routines screen.
 * @param title - The routine's title.
 * @param blockCount - How many blocks the routine has, 1 or more. Each block after the first is
 * added with Add block and keeps its defaults.
 */
export async function createRoutine(page: Page, title: string, blockCount = 1): Promise<void> {
	await page.getByRole('button', { name: 'New routine' }).click();
	await page.getByRole('textbox', { name: 'Title', exact: true }).fill(title);
	for (let added = 1; added < blockCount; added++) {
		await page.getByRole('button', { name: 'Add block' }).click();
	}
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(routineList(page).getByRole('heading', { level: 2, name: title })).toBeVisible();
}
