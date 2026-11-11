// Reading the run summary in component tests, the way a user reads it.

import type { Locator } from 'vitest/browser';

/**
 * Reads the totals a run summary shows, as label and value pairs in the order they appear.
 *
 * @param dialog - The summary dialog.
 * @returns Each total's label and its value, such as `['Rounds reached', '1']`.
 */
export function shownTotals(dialog: Locator): string[][] {
	const labels = dialog.getByRole('term').elements();
	const values = dialog.getByRole('definition').elements();
	return labels.map((label, index) => [label.textContent, values[index]?.textContent ?? '']);
}
