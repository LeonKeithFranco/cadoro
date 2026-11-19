// Reading what the app saved, from inside the page, so a journey can check its records end to
// end.

import type { Page } from '@playwright/test';
import type { WorkPeriod } from '../src/lib/run-records';

/**
 * Reads every work period the app has saved in its IndexedDB database.
 *
 * @remarks
 * It runs in the page with IndexedDB's own API, since the test can't import the app's storage
 * into the browser. Opening the database without a version reads it as it is, without changing
 * its schema.
 *
 * @param page - A page of the app, whose database is read.
 * @returns The saved work periods, in IndexedDB's order, by id.
 * @throws Rejects with IndexedDB's error when the database or its `workPeriods` table can't be
 * read.
 */
export async function savedWorkPeriods(page: Page): Promise<WorkPeriod[]> {
	return page.evaluate(
		() =>
			new Promise<WorkPeriod[]>((resolve, reject) => {
				const opening = indexedDB.open('cadoro');
				opening.onerror = (): void =>
					reject(opening.error ?? new Error('Opening the database failed.'));
				opening.onsuccess = (): void => {
					const database = opening.result;
					const reading = database.transaction('workPeriods').objectStore('workPeriods').getAll();
					reading.onerror = (): void =>
						reject(reading.error ?? new Error('Reading the work periods failed.'));
					reading.onsuccess = (): void => {
						database.close();
						resolve(reading.result);
					};
				};
			})
	);
}

/**
 * Saves the settings row in the app's IndexedDB database, as the Settings screen will once it
 * exists, so a journey can start from a chosen theme.
 *
 * @remarks
 * It writes with IndexedDB's own API, so the page's open Dexie connection isn't told, and a
 * journey reloads the page to make the app read the row. The page must have loaded the app once
 * already, so the database and its `settings` table exist.
 *
 * @param page - A page of the app, whose database is written.
 * @param row - The settings row, holding only the settings to change from their defaults.
 * @throws Rejects with IndexedDB's error when the database or its `settings` table can't be
 * written.
 */
export async function saveSettingsRow(page: Page, row: { theme: string }): Promise<void> {
	await page.evaluate(
		(settingsRow) =>
			new Promise<void>((resolve, reject) => {
				const opening = indexedDB.open('cadoro');
				opening.onerror = (): void =>
					reject(opening.error ?? new Error('Opening the database failed.'));
				opening.onsuccess = (): void => {
					const database = opening.result;
					const writing = database
						.transaction('settings', 'readwrite')
						.objectStore('settings')
						.put(settingsRow, 'current');
					writing.onerror = (): void =>
						reject(writing.error ?? new Error('Saving the settings failed.'));
					writing.onsuccess = (): void => {
						database.close();
						resolve();
					};
				};
			}),
		row
	);
}
