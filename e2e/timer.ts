// What a journey does on the Timer screen's run, shared by the journeys that end a run or read a
// block's boxes.

import type { Locator, Page } from '@playwright/test';

/**
 * Finds the Work or Break box of a block's card.
 *
 * @remarks
 * Each box is named by its label, which changes with the run, such as "Work · Overtime" or
 * "Break over", so the name is matched by its start.
 *
 * @param page - A page of the app on the Timer screen.
 * @param block - The block's title, which names its card, such as `Focus`.
 * @param label - The box, `Work` or `Break`, which its name starts with.
 * @returns The box.
 */
export function timerBox(page: Page, block: string, label: 'Work' | 'Break'): Locator {
	return page
		.getByRole('region', { name: block })
		.getByRole('group', { name: new RegExp(`^${label}`) });
}

/**
 * Presses Finish and confirms the question, which ends the run and shows its summary.
 *
 * @param page - A page of the app, on the Timer screen with a run in progress.
 */
export async function finishRun(page: Page): Promise<void> {
	await page.getByRole('button', { name: 'Finish' }).click();
	await page
		.getByRole('dialog', { name: 'Finish this run?' })
		.getByRole('button', { name: 'Finish' })
		.click();
}

/**
 * Presses Done in the run summary, which closes it and readies a new run.
 *
 * @param page - A page of the app, showing the summary of an ended run.
 */
export async function closeSummary(page: Page): Promise<void> {
	await page
		.getByRole('dialog', { name: 'Run summary' })
		.getByRole('button', { name: 'Done' })
		.click();
}
