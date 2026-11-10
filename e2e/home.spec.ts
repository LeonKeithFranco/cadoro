import { expect, test } from '@playwright/test';

test('the home page shows the app name', async ({ page }) => {
	await page.goto('/');

	await expect(page).toHaveTitle('Cadoro');
	await expect(page.getByRole('heading', { level: 1, name: 'Cadoro' })).toBeVisible();
});
