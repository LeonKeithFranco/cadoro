import { expect, test } from '@playwright/test';

test('the app opens on the Timer screen', async ({ page }) => {
	await page.goto('/');

	await expect(page).toHaveTitle('Timer · Cadoro');
	await expect(page.getByRole('heading', { level: 1, name: 'Timer' })).toBeVisible();
});
