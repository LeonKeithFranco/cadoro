// Reading what the app saved, from inside the page, so a journey can check its records end to
// end.

import type { Page } from '@playwright/test';
import type { WorkPeriod } from '../src/lib/run-records';
import type { Settings } from '../src/lib/settings';

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
 * Tells whether the app has a run in progress saved in its IndexedDB database.
 *
 * @remarks
 * It reads with IndexedDB's own API, as {@link savedWorkPeriods} does, so a journey can wait
 * until Done has forgotten an ended run before it reloads the page.
 *
 * @param page - A page of the app, whose database is read.
 * @returns `true` while a run in progress is saved, and `false` once none is.
 * @throws Rejects with IndexedDB's error when the database or its `runInProgress` table can't be
 * read.
 */
export async function hasSavedRunInProgress(page: Page): Promise<boolean> {
	return page.evaluate(
		() =>
			new Promise<boolean>((resolve, reject) => {
				const opening = indexedDB.open('cadoro');
				opening.onerror = (): void =>
					reject(opening.error ?? new Error('Opening the database failed.'));
				opening.onsuccess = (): void => {
					const database = opening.result;
					const counting = database
						.transaction('runInProgress')
						.objectStore('runInProgress')
						.count();
					counting.onerror = (): void =>
						reject(counting.error ?? new Error('Reading the run in progress failed.'));
					counting.onsuccess = (): void => {
						database.close();
						resolve(counting.result > 0);
					};
				};
			})
	);
}

/**
 * Reads the settings row the app has saved in its IndexedDB database.
 *
 * @remarks
 * It reads with IndexedDB's own API, as {@link savedWorkPeriods} does, so a journey can wait
 * until a change on the Settings screen is saved before it reloads the page.
 *
 * @param page - A page of the app, whose database is read.
 * @returns The row, holding only the settings the user has changed, or `undefined` while none
 * has been saved.
 * @throws Rejects with IndexedDB's error when the database or its `settings` table can't be
 * read.
 */
export async function savedSettingsRow(page: Page): Promise<Partial<Settings> | undefined> {
	return page.evaluate(
		() =>
			new Promise<Partial<Settings> | undefined>((resolve, reject) => {
				const opening = indexedDB.open('cadoro');
				opening.onerror = (): void =>
					reject(opening.error ?? new Error('Opening the database failed.'));
				opening.onsuccess = (): void => {
					const database = opening.result;
					const reading = database.transaction('settings').objectStore('settings').get('current');
					reading.onerror = (): void =>
						reject(reading.error ?? new Error('Reading the settings failed.'));
					reading.onsuccess = (): void => {
						database.close();
						resolve(reading.result as Partial<Settings> | undefined);
					};
				};
			})
	);
}

/**
 * Saves the settings row in the app's IndexedDB database, so a journey can start from chosen
 * settings without going through the Settings screen.
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
export async function saveSettingsRow(page: Page, row: Partial<Settings>): Promise<void> {
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
