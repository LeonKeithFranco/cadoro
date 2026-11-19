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
				opening.onerror = (): void => reject(opening.error);
				opening.onsuccess = (): void => {
					const database = opening.result;
					const reading = database.transaction('workPeriods').objectStore('workPeriods').getAll();
					reading.onerror = (): void => reject(reading.error);
					reading.onsuccess = (): void => {
						database.close();
						resolve(reading.result);
					};
				};
			})
	);
}
