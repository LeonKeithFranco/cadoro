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

test('the pinned controls stay above the phone’s tab bar, at the top of a long routine and scrolled down', async ({
	page
}) => {
	// A routine of twelve blocks, so its cards fill several screens and the controls are pinned.
	await page.goto('/routines');
	await page.getByRole('button', { name: 'New routine' }).click();
	await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Long routine');
	for (let added = 1; added < 12; added++) {
		await page.getByRole('button', { name: 'Add block' }).click();
	}
	await page.getByRole('button', { name: 'Save' }).click();
	await page.goto('/');
	await page.getByRole('combobox', { name: 'Routine' }).selectOption({ label: 'Long routine' });
	const tabBar = page.getByRole('navigation', { name: 'Screens' });
	const finish = page.getByRole('button', { name: 'Finish' });
	await expect(tabBar).toBeVisible();
	expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeGreaterThan(
		(page.viewportSize()?.height ?? 0) * 2
	);

	for (const scrolled of [false, true]) {
		await page.evaluate((toBottom) => {
			window.scrollTo(0, toBottom ? document.documentElement.scrollHeight : 0);
		}, scrolled);

		const controls = await finish.boundingBox();
		const bar = await tabBar.boundingBox();
		if (controls === null || bar === null) {
			throw new Error('Expected the controls and the tab bar on the page.');
		}
		// The tab bar is at the bottom on a phone and in the header from `md`, where the controls
		// only have to stay inside the window.
		const isTabBarAtBottom = bar.y > controls.y;
		const floor = isTabBarAtBottom ? bar.y : (page.viewportSize()?.height ?? 0);
		expect(controls.y + controls.height).toBeLessThanOrEqual(floor);
	}
});
