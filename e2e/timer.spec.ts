import { expect, test } from '@playwright/test';
import { minutes } from '../src/lib/testing/durations';
import { followLink, openOnPausedClock } from './clock';

test('a run pauses when the user leaves the Timer screen, so the time away is not counted', async ({
	page
}) => {
	await openOnPausedClock(page, '/');
	const navigation = page.getByRole('navigation', { name: 'Screens' });
	const picker = page.getByRole('combobox', { name: 'Routine' });
	const workBox = page.getByRole('region', { name: 'Focus' }).getByRole('group', { name: 'Work' });

	await test.step('Play starts the run, which counts up', async () => {
		await page.getByRole('button', { name: 'Play' }).click();
		await page.clock.fastForward(minutes(4));

		await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
		await expect(workBox).toContainText('4:00 / 25:00');
		await expect(picker).toBeDisabled();
	});

	await test.step('leaving for another screen and coming back finds the run paused', async () => {
		await followLink(page, navigation.getByRole('link', { name: 'Stats' }));
		await expect(page.getByRole('heading', { level: 1, name: 'Stats' })).toBeVisible();
		await page.clock.fastForward(minutes(10));
		await followLink(page, navigation.getByRole('link', { name: 'Timer' }));

		await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
		await expect(picker).toBeDisabled();
		await expect(workBox).toContainText('4:00 / 25:00');
	});

	await test.step('the run summary counts only the time before leaving', async () => {
		await page.getByRole('button', { name: 'Finish' }).click();
		await page
			.getByRole('dialog', { name: 'Finish this run?' })
			.getByRole('button', { name: 'Finish' })
			.click();

		const summary = page.getByRole('dialog', { name: 'Run summary' });
		// Total work time, work periods, rounds reached and overtime, in that order.
		await expect(summary.getByRole('definition')).toHaveText(['4:00', '1', '1', '0:00']);
		await summary.getByRole('button', { name: 'Done' }).click();

		await expect(summary).toBeHidden();
		await expect(workBox).toContainText('0:00 / 25:00');
		await expect(picker).toBeEnabled();
	});
});
