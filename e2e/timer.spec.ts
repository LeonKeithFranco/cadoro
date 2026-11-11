import { expect, test } from '@playwright/test';

test('a run pauses when the user leaves the Timer screen, and Finish ends it', async ({ page }) => {
	await page.goto('/');
	const navigation = page.getByRole('navigation', { name: 'Screens' });
	const picker = page.getByRole('combobox', { name: 'Routine' });
	const workBox = page.getByRole('region', { name: 'Focus' }).getByRole('group', { name: 'Work' });

	await test.step('Play starts the run, which counts up every second', async () => {
		await page.getByRole('button', { name: 'Play' }).click();

		await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
		await expect(workBox).toContainText('0:01 / 25:00');
		await expect(picker).toBeDisabled();
	});

	await test.step('leaving for another screen and coming back finds the run paused', async () => {
		await navigation.getByRole('link', { name: 'Stats' }).click();
		await expect(page.getByRole('heading', { level: 1, name: 'Stats' })).toBeVisible();
		await navigation.getByRole('link', { name: 'Timer' }).click();

		await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
		await expect(picker).toBeDisabled();
		await expect(workBox).not.toContainText('0:00 / 25:00');
	});

	await test.step('Finish ends the run and readies a new one', async () => {
		await page.getByRole('button', { name: 'Finish' }).click();

		await expect(workBox).toContainText('0:00 / 25:00');
		await expect(page.getByRole('button', { name: 'Finish' })).toBeDisabled();
		await expect(picker).toBeEnabled();
	});
});
