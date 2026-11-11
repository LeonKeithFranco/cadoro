import { expect, test } from '@playwright/test';

test('after one visit, the app opens and runs with no connection', async ({ page }) => {
	const navigation = page.getByRole('navigation', { name: 'Screens' });
	const workBox = page.getByRole('region', { name: 'Focus' }).getByRole('group', { name: 'Work' });

	await test.step('the first visit installs the service worker', async () => {
		await page.goto('');
		await expect(page.getByRole('heading', { level: 1, name: 'Timer' })).toBeVisible();

		// A service worker only becomes active once every file it keeps is cached.
		await expect
			.poll(
				() =>
					page.evaluate(async () => {
						const registration = await navigator.serviceWorker.getRegistration();
						return registration?.active?.state;
					}),
				{ message: 'a service worker becomes active' }
			)
			.toBe('activated');
	});

	await test.step('offline, a reload opens the app and Play counts', async () => {
		await page.context().setOffline(true);
		await page.reload();

		await expect(page.getByRole('heading', { level: 1, name: 'Timer' })).toBeVisible();
		await page.getByRole('button', { name: 'Play' }).click();
		// Real time passes here, so any time from 0:01 shows that the timer counts.
		await expect(workBox).toContainText(/0:0[1-9] \/ 25:00/);
	});

	await test.step('offline, other screens open from their link and their address', async () => {
		await navigation.getByRole('link', { name: 'Stats' }).click();
		await expect(page.getByRole('heading', { level: 1, name: 'Stats' })).toBeVisible();

		await page.goto('settings');
		await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
	});
});
