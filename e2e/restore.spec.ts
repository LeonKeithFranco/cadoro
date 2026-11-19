import { expect, test } from '@playwright/test';
import { minutes, seconds } from '../src/lib/testing/durations';
import { openOnPausedClock } from './clock';
import { savedWorkPeriods } from './storage';

test('a reload mid-run restores the run paused, with exact times, and its work is saved once', async ({
	page
}) => {
	await openOnPausedClock(page, '/');
	const picker = page.getByRole('combobox', { name: 'Routine' });
	const card = page.getByRole('region', { name: 'Focus' });
	// Each box is named by its label, which changes with the run, such as "Work · Overtime".
	const workBox = card.getByRole('group', { name: /^Work/ });
	const breakBox = card.getByRole('group', { name: /^Break/ });
	const summary = page.getByRole('dialog', { name: 'Run summary' });

	await test.step('a reload mid-work restores the run paused, with its routine', async () => {
		// Not the first routine, so the reload must restore the one the run belongs to.
		await picker.selectOption('Classic with long break');
		await page.getByRole('button', { name: 'Play' }).click();
		await page.clock.fastForward(minutes(10));

		await page.reload();

		await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
		await expect(picker).toBeDisabled();
		// The option's value is the routine's id, which is new on every first launch, so the test
		// reads the chosen option's text.
		await expect(picker.locator('option:checked')).toHaveText('Classic with long break');
		await expect(page.getByText('Round 1 · Block 1 of 2 · Cycle 1 of 3')).toBeVisible();
		await expect(workBox).toContainText('10:00 / 25:00');
	});

	await test.step('time after the reload doesn’t count until Play', async () => {
		await page.clock.fastForward(minutes(5));
		await expect(workBox).toContainText('10:00 / 25:00');

		await page.getByRole('button', { name: 'Play' }).click();
		await page.clock.fastForward(minutes(16));

		await expect(workBox).toContainText('26:00 / 25:00');
	});

	await test.step('a reload mid-break restores the break paused, with the time it had left', async () => {
		await page.getByRole('button', { name: 'Next' }).click();
		await page.clock.fastForward(minutes(2));
		// 20% of 26 minutes is 5:12, and 2 minutes have gone.
		await expect(breakBox).toContainText('3:12');

		await page.reload();

		await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
		await expect(breakBox).toHaveAccessibleName('Break');
		await expect(breakBox).toContainText('3:12');
		await expect(workBox).toContainText('26:00 / 25:00');
	});

	await test.step('Play resumes the restored break', async () => {
		await page.getByRole('button', { name: 'Play' }).click();
		await page.clock.fastForward(minutes(1) + seconds(2));

		await expect(breakBox).toContainText('2:10');
	});

	await test.step('a reload keeps the summary of a run that has ended, until Done', async () => {
		await page.getByRole('button', { name: 'Finish' }).click();
		await page
			.getByRole('dialog', { name: 'Finish this run?' })
			.getByRole('button', { name: 'Finish' })
			.click();
		await expect(summary).toBeVisible();

		await page.reload();

		await expect(summary).toBeVisible();
		await expect(summary.getByText('Classic with long break')).toBeVisible();
		// Total work time, work periods, rounds reached and overtime, in that order.
		await expect(summary.getByRole('definition')).toHaveText(['26:00', '1', '1', '1:00']);
	});

	await test.step('the work period is saved once, with both its stretches', async () => {
		// The clock paused at 9:01 UTC, so Play started the work then, and the reload paused it at
		// 9:11. Play resumed it 5 minutes later, and Next ended it 16 minutes after that.
		expect(await savedWorkPeriods(page)).toEqual([
			expect.objectContaining({
				segments: [
					{ start: '2026-11-10T09:01:00.000Z', end: '2026-11-10T09:11:00.000Z' },
					{ start: '2026-11-10T09:16:00.000Z', end: '2026-11-10T09:32:00.000Z' }
				],
				workedMs: minutes(26)
			})
		]);
	});

	await test.step('Done, then a reload, gives a new run, ready to start', async () => {
		await summary.getByRole('button', { name: 'Done' }).click();

		await page.reload();

		await expect(summary).toBeHidden();
		await expect(picker).toBeEnabled();
		await expect(page.getByRole('button', { name: 'Finish' })).toBeDisabled();
		await expect(workBox).toContainText('0:00 / 25:00');
	});
});
