import { expect, test } from '@playwright/test';
import { minutes, seconds } from '../src/lib/testing/durations';
import { openOnPausedClock } from './clock';

test('a run goes through work, overtime and a break, then Finish shows its summary', async ({
	page
}) => {
	await openOnPausedClock(page, '/');
	const card = page.getByRole('region', { name: 'Focus' });
	// Each box is named by its label, which changes with the run, such as "Work · Overtime".
	const workBox = card.getByRole('group', { name: /^Work/ });
	const breakBox = card.getByRole('group', { name: /^Break/ });
	const finishQuestion = page.getByRole('dialog', { name: 'Finish this run?' });
	const summary = page.getByRole('dialog', { name: 'Run summary' });

	await test.step('work counts up past its target into overtime', async () => {
		await page.getByRole('combobox', { name: 'Routine' }).selectOption('Classic with long break');
		await page.getByRole('button', { name: 'Play' }).click();
		await page.clock.fastForward(minutes(26));

		await expect(workBox).toHaveAccessibleName('Work · Overtime');
		await expect(workBox).toContainText('26:00 / 25:00');
		// 20% of 26 minutes.
		await expect(breakBox).toHaveAccessibleName('Break earned');
		await expect(breakBox).toContainText('5:12');
	});

	await test.step('Next starts the break earned, which counts down to Break over', async () => {
		await page.getByRole('button', { name: 'Next' }).click();
		await page.clock.fastForward(minutes(2));

		await expect(breakBox).toHaveAccessibleName('Break');
		await expect(breakBox).toContainText('3:12');
		await expect(workBox).toContainText('26:00 / 25:00');

		await page.clock.fastForward(minutes(3) + seconds(12));

		await expect(breakBox).toHaveAccessibleName('Break over');
		await expect(breakBox).toContainText('0:00');
		await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
	});

	await test.step('Play starts the next cycle once the break is over', async () => {
		await page.getByRole('button', { name: 'Play' }).click();
		await page.clock.fastForward(minutes(10));

		await expect(page.getByText('Round 1 · Block 1 of 2 · Cycle 2 of 3')).toBeVisible();
		await expect(workBox).toHaveAccessibleName('Work');
		await expect(workBox).toContainText('10:00 / 25:00');
	});

	await test.step('Finish asks first, and Cancel keeps the run counting', async () => {
		await page.getByRole('button', { name: 'Finish' }).click();
		await expect(finishQuestion).toBeVisible();
		await page.clock.fastForward(seconds(20));

		await finishQuestion.getByRole('button', { name: 'Cancel' }).click();
		await page.clock.fastForward(seconds(10));

		await expect(finishQuestion).toBeHidden();
		await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
		await expect(workBox).toContainText('10:30 / 25:00');
	});

	await test.step('confirming Finish ends the run and shows its summary', async () => {
		await page.getByRole('button', { name: 'Finish' }).click();
		await finishQuestion.getByRole('button', { name: 'Finish' }).click();

		await expect(summary).toBeVisible();
		await expect(summary.getByText('Classic with long break')).toBeVisible();
		await expect(summary.getByRole('term')).toHaveText([
			'Total work time',
			'Work periods completed',
			'Rounds reached',
			'Total overtime'
		]);
		await expect(summary.getByRole('definition')).toHaveText(['36:30', '2', '1', '1:00']);
	});

	await test.step('Done closes the summary and readies a new run of the same routine', async () => {
		await summary.getByRole('button', { name: 'Done' }).click();

		await expect(summary).toBeHidden();
		await expect(page.getByRole('combobox', { name: 'Routine' })).toBeEnabled();
		// Classic's position would read just "Round 1", so this shows it's the same routine.
		await expect(page.getByText('Round 1 · Block 1 of 2 · Cycle 1 of 3')).toBeVisible();
		await expect(workBox).toContainText('0:00 / 25:00');
		await expect(page.getByRole('button', { name: 'Finish' })).toBeDisabled();
	});
});
