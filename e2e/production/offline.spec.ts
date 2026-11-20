import { expect, test } from '@playwright/test';
import { CHIME_IDS } from '../../src/lib/chimes.ts';
import { waitForActiveWorker } from '../service-worker.ts';

test('a service worker registered from a deep screen covers the whole app', async ({ page }) => {
	await page.goto('settings/log');
	await expect(page.getByRole('heading', { level: 1, name: 'Activity log' })).toBeVisible();
	await waitForActiveWorker(page);

	const scope = await page.evaluate(
		async () => (await navigator.serviceWorker.getRegistration())?.scope
	);
	expect(scope).toBe(new URL('/cadoro/', page.url()).href);

	await page.context().setOffline(true);
	await page.goto('');
	await expect(page.getByRole('heading', { level: 1, name: 'Timer' })).toBeVisible();
});

test('after one visit, the app opens and runs with no connection', async ({ page }) => {
	const navigation = page.getByRole('navigation', { name: 'Screens' });
	const workBox = page.getByRole('region', { name: 'Focus' }).getByRole('group', { name: 'Work' });

	await test.step('the first visit installs the service worker', async () => {
		await page.goto('');
		await expect(page.getByRole('heading', { level: 1, name: 'Timer' })).toBeVisible();
		await waitForActiveWorker(page);
	});

	await test.step('offline, a reload opens the app and Play counts', async () => {
		await page.context().setOffline(true);
		await page.reload();

		await expect(page.getByRole('heading', { level: 1, name: 'Timer' })).toBeVisible();
		await page.getByRole('button', { name: 'Play' }).click();
		// Real time passes here, so any time from 0:01 shows that the timer counts.
		await expect(workBox).toContainText(/0:0[1-9] \/ 25:00/);
	});

	await test.step('offline, every chime still loads', async () => {
		const statuses = await page.evaluate(async (names) => {
			const responses = await Promise.all(names.map((name) => fetch(`chimes/${name}.mp3`)));
			return responses.map((response) => response.status);
		}, CHIME_IDS);
		expect(statuses).toEqual(CHIME_IDS.map(() => 200));
	});

	await test.step('offline, other screens open from their link and their address', async () => {
		await navigation.getByRole('link', { name: 'Stats' }).click();
		await expect(page.getByRole('heading', { level: 1, name: 'Stats' })).toBeVisible();

		await page.goto('settings');
		await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
	});
});
