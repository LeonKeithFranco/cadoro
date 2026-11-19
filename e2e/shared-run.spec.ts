import { expect, test, type Locator, type Page } from '@playwright/test';
import { minutes, seconds } from '../src/lib/testing/durations';
import { followLink, openOnPausedClock } from './clock';
import { savedWorkPeriods } from './storage';

/**
 * How long the paused clock runs to let the tabs notice a change and finish loading, in
 * milliseconds. Dexie's live query waits on a timer before telling the app about a change, and
 * the fake clock holds every timer back until it moves. It's under a second, so a run counting
 * meanwhile shows no difference.
 */
const SETTLE_MS = 100;

/**
 * Lets every tab of the browser context notice a change another tab saved.
 *
 * @remarks
 * All the pages of a context share one fake clock, so running it once moves every tab.
 *
 * @param tab - Any page of the context.
 */
async function letTabsSettle(tab: Page): Promise<void> {
	await tab.clock.runFor(SETTLE_MS);
}

/**
 * Finds the work box of the Focus routine's card on a page.
 *
 * @param page - A page of the app on the Timer screen.
 * @returns The box that shows the work time, named by its label, such as "Work · Overtime".
 */
function workBox(page: Page): Locator {
	return page.getByRole('region', { name: 'Focus' }).getByRole('group', { name: /^Work/ });
}

test('two tabs share one run: a press shows in both, joining doesn’t pause, work is saved once, and closing all restores it paused', async ({
	page
}) => {
	const firstTab = page;
	await openOnPausedClock(firstTab, '/');
	await firstTab.getByRole('button', { name: 'Play' }).click();
	await firstTab.clock.fastForward(minutes(10));
	await expect(workBox(firstTab)).toContainText('10:00 / 25:00');

	const secondTab = await firstTab.context().newPage();

	await test.step('a tab opened mid-run joins it without pausing it', async () => {
		// The context's clock is installed and paused already, and shared by every page.
		await secondTab.goto('/');
		await letTabsSettle(firstTab);

		await expect(secondTab.getByRole('button', { name: 'Pause' })).toBeVisible();
		await expect(secondTab.getByRole('combobox', { name: 'Routine' })).toBeDisabled();
		await expect(workBox(secondTab)).toContainText('10:00 / 25:00');
		await expect(firstTab.getByRole('button', { name: 'Pause' })).toBeVisible();

		// Still counting: a minute later, both tabs show it.
		await firstTab.clock.fastForward(minutes(1));

		await expect(workBox(firstTab)).toContainText('11:00 / 25:00');
		await expect(workBox(secondTab)).toContainText('11:00 / 25:00');
		await expect(secondTab.getByRole('button', { name: 'Pause' })).toBeVisible();
	});

	await test.step('Pause in one tab shows in the other', async () => {
		await firstTab.getByRole('button', { name: 'Pause' }).click();
		await letTabsSettle(firstTab);

		await expect(firstTab.getByRole('button', { name: 'Play' })).toBeVisible();
		await expect(secondTab.getByRole('button', { name: 'Play' })).toBeVisible();
	});

	await test.step('Play in the other tab shows in the first, and time keeps counting in both', async () => {
		await secondTab.getByRole('button', { name: 'Play' }).click();
		await letTabsSettle(firstTab);
		await firstTab.clock.fastForward(minutes(5));

		await expect(firstTab.getByRole('button', { name: 'Pause' })).toBeVisible();
		await expect(workBox(firstTab)).toContainText('16:00 / 25:00');
		await expect(workBox(secondTab)).toContainText('16:00 / 25:00');
	});

	await test.step('Next in one tab ends the work, and its period is saved once', async () => {
		await firstTab.getByRole('button', { name: 'Next' }).click();
		await letTabsSettle(firstTab);

		const breakBox = secondTab.getByRole('group', { name: 'Break' });
		await expect(breakBox).toBeVisible();
		// 20% of 16 minutes is 3:12.
		await expect(breakBox).toContainText('3:12');
		await expect.poll(async () => (await savedWorkPeriods(firstTab)).length).toBe(1);
		expect(await savedWorkPeriods(secondTab)).toHaveLength(1);
	});

	await test.step('leaving the Timer screen in one tab pauses the run in the other', async () => {
		await expect(secondTab.getByRole('button', { name: 'Pause' })).toBeVisible();

		await followLink(firstTab, firstTab.getByRole('link', { name: 'Stats' }).first());
		await letTabsSettle(firstTab);

		await expect(secondTab.getByRole('button', { name: 'Play' })).toBeVisible();
	});

	await test.step('with every tab closed, reopening restores the run paused', async () => {
		// Start the break counting again, so a restore that doesn't pause it would show.
		await secondTab.getByRole('button', { name: 'Play' }).click();
		await letTabsSettle(secondTab);
		await secondTab.clock.fastForward(seconds(10));
		await expect(secondTab.getByRole('button', { name: 'Pause' })).toBeVisible();
		const context = firstTab.context();
		await secondTab.close();
		await firstTab.close();

		const reopened = await context.newPage();
		await reopened.goto('/');
		await letTabsSettle(reopened);

		await expect(reopened.getByRole('button', { name: 'Play' })).toBeVisible();
		await expect(reopened.getByRole('combobox', { name: 'Routine' })).toBeDisabled();
		await expect(reopened.getByRole('group', { name: 'Break' })).toBeVisible();
	});
});
