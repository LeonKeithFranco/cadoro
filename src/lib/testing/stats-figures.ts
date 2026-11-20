// Reading the Stats screen's headline figures in component tests, the way a user reads them.

import { page } from 'vitest/browser';

/**
 * Finds the value of one headline figure, from the screen's terms and definitions in the order they
 * appear, as `shownTotals` reads a run summary.
 *
 * @param label - The figure's label, such as "Today" or "All time".
 * @returns A function that reads the figure's text, for `expect.poll`, which keeps asking until
 * the screen shows it, or to call at once. It gives `undefined` while the figure isn't on the
 * screen.
 */
export function figure(label: string): () => string | undefined {
	return () => {
		const labels = page.getByRole('term').elements();
		const values = page.getByRole('definition').elements();
		const index = labels.findIndex((term) => term.textContent === label);
		return values[index]?.textContent.trim();
	};
}
