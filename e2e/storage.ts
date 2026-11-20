// Reading what the app saved, from inside the page, so a journey can check its records end to
// end.

import type { Page } from '@playwright/test';
import type { WorkPeriod } from '../src/lib/run-records';
import type { Settings } from '../src/lib/settings';

/** What to read from one table of the app's database. */
type StoreRead =
	/** Every row of the table, in IndexedDB's order, by key. */
	| { kind: 'all' }
	/** How many rows the table holds. */
	| { kind: 'count' }
	/** The row saved under one key, or `undefined` when there is none. */
	| { kind: 'row'; key: string };

/**
 * Reads from one table of the app's IndexedDB database.
 *
 * @remarks
 * It runs in the page with IndexedDB's own API, since the test can't import the app's storage
 * into the browser. Opening the database without a version reads it as it is, without changing
 * its schema.
 *
 * @typeParam Result - What the read gives, which the caller states, since the page can't check
 * it: an array of rows for `all`, a number for `count` and a row or `undefined` for `row`.
 * @param page - A page of the app, whose database is read.
 * @param tableName - The table to read, such as `workPeriods`.
 * @param read - What to read from the table.
 * @returns The result of the read.
 * @throws Rejects with IndexedDB's error when the database or the table can't be read.
 */
async function readTable<Result>(page: Page, tableName: string, read: StoreRead): Promise<Result> {
	return page.evaluate(
		({ tableName: table, read: operation }) =>
			new Promise<Result>((resolve, reject) => {
				const opening = indexedDB.open('cadoro');
				opening.onerror = (): void =>
					reject(opening.error ?? new Error('Opening the database failed.'));
				opening.onsuccess = (): void => {
					const database = opening.result;
					const store = database.transaction(table).objectStore(table);
					const reading =
						operation.kind === 'all'
							? store.getAll()
							: operation.kind === 'count'
								? store.count()
								: store.get(operation.key);
					reading.onerror = (): void =>
						reject(reading.error ?? new Error(`Reading the ${table} table failed.`));
					reading.onsuccess = (): void => {
						database.close();
						resolve(reading.result as Result);
					};
				};
			}),
		{ tableName, read }
	);
}

/**
 * Reads every work period the app has saved in its IndexedDB database.
 *
 * @param page - A page of the app, whose database is read.
 * @returns The saved work periods, in IndexedDB's order, by id.
 * @throws Rejects with IndexedDB's error when the database or its `workPeriods` table can't be
 * read.
 */
export async function savedWorkPeriods(page: Page): Promise<WorkPeriod[]> {
	return readTable<WorkPeriod[]>(page, 'workPeriods', { kind: 'all' });
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
	const savedRuns = await readTable<number>(page, 'runInProgress', { kind: 'count' });
	return savedRuns > 0;
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
	return readTable<Partial<Settings> | undefined>(page, 'settings', {
		kind: 'row',
		key: 'current'
	});
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
