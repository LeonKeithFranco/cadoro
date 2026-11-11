import { page, userEvent } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { RunSummary as Summary } from '../run';
import { hours, minutes, seconds } from '../testing/durations';
import { shownTotals } from '../testing/run-summary';
import RunSummary from './RunSummary.svelte';

describe('the run summary', () => {
	it('names the routine that was run and shows its totals in order', async () => {
		const summary: Summary = {
			totalWorkMs: hours(1) + minutes(7) + seconds(40),
			periodsCompleted: 3,
			roundsReached: 1,
			overtimeMs: minutes(7) + seconds(40)
		};
		render(RunSummary, { routineTitle: 'Classic with long break', summary, ondone: vi.fn() });

		const dialog = page.getByRole('dialog', { name: 'Run summary' });
		await expect.element(dialog).toBeVisible();
		await expect.element(dialog.getByText('Classic with long break')).toBeVisible();
		expect(shownTotals(dialog)).toEqual([
			['Total work time', '1:07:40'],
			['Work periods completed', '3'],
			['Rounds reached', '1'],
			['Total overtime', '7:40']
		]);
	});

	it('shows times rounded down to the second, and no overtime as 0:00', async () => {
		const summary: Summary = {
			totalWorkMs: minutes(12) + 999,
			periodsCompleted: 1,
			roundsReached: 1,
			overtimeMs: 0
		};
		render(RunSummary, { routineTitle: 'Classic', summary, ondone: vi.fn() });

		const dialog = page.getByRole('dialog', { name: 'Run summary' });
		await expect.element(dialog).toBeVisible();
		expect(shownTotals(dialog)).toEqual([
			['Total work time', '12:00'],
			['Work periods completed', '1'],
			['Rounds reached', '1'],
			['Total overtime', '0:00']
		]);
	});

	it('reports Done', async () => {
		const ondone = vi.fn();
		const summary: Summary = {
			totalWorkMs: 0,
			periodsCompleted: 0,
			roundsReached: 0,
			overtimeMs: 0
		};
		render(RunSummary, { routineTitle: 'Classic', summary, ondone });

		await page.getByRole('button', { name: 'Done' }).click();

		expect(ondone).toHaveBeenCalledOnce();
	});

	it('reports Escape the same as Done', async () => {
		const ondone = vi.fn();
		const summary: Summary = {
			totalWorkMs: 0,
			periodsCompleted: 0,
			roundsReached: 0,
			overtimeMs: 0
		};
		render(RunSummary, { routineTitle: 'Classic', summary, ondone });
		await expect.element(page.getByRole('dialog', { name: 'Run summary' })).toBeVisible();

		await userEvent.keyboard('{Escape}');

		await expect.poll(() => ondone).toHaveBeenCalledOnce();
	});
});
