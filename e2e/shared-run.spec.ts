import { expect, test } from '@playwright/test';
import { minutes, seconds } from '../src/lib/testing/durations';
import { followLink, openOnPausedClock, settle } from './clock';
import { screenLink } from './screens';
import { savedWorkPeriods } from './storage';
import { timerBox } from './timer';

test('two tabs share one run: a press shows in both, joining doesn’t pause, work is saved once, and closing all restores it paused', async ({
	page
}) => {
	const firstTab = page;
	await openOnPausedClock(firstTab, '/');
	await firstTab.getByRole('button', { name: 'Play' }).click();
	await firstTab.clock.fastForward(minutes(10));
	await expect(timerBox(firstTab, 'Focus', 'Work')).toContainText('10:00 / 25:00');

	const secondTab = await firstTab.context().newPage();

	await test.step('a tab opened mid-run joins it without pausing it', async () => {
		// The context's clock is installed and paused already, and shared by every page.
		await secondTab.goto('/');
		await settle(firstTab);

		await expect(secondTab.getByRole('button', { name: 'Pause' })).toBeVisible();
		await expect(secondTab.getByRole('combobox', { name: 'Routine' })).toBeDisabled();
		await expect(timerBox(secondTab, 'Focus', 'Work')).toContainText('10:00 / 25:00');
		await expect(firstTab.getByRole('button', { name: 'Pause' })).toBeVisible();

		// Still counting: a minute later, both tabs show it.
		await firstTab.clock.fastForward(minutes(1));

		await expect(timerBox(firstTab, 'Focus', 'Work')).toContainText('11:00 / 25:00');
		await expect(timerBox(secondTab, 'Focus', 'Work')).toContainText('11:00 / 25:00');
		await expect(secondTab.getByRole('button', { name: 'Pause' })).toBeVisible();
	});

	await test.step('Pause in one tab shows in the other', async () => {
		await firstTab.getByRole('button', { name: 'Pause' }).click();
		await settle(firstTab);

		await expect(firstTab.getByRole('button', { name: 'Play' })).toBeVisible();
		await expect(secondTab.getByRole('button', { name: 'Play' })).toBeVisible();
	});

	await test.step('Play in the other tab shows in the first, and time keeps counting in both', async () => {
		await secondTab.getByRole('button', { name: 'Play' }).click();
		await settle(firstTab);
		await firstTab.clock.fastForward(minutes(5));

		await expect(firstTab.getByRole('button', { name: 'Pause' })).toBeVisible();
		await expect(timerBox(firstTab, 'Focus', 'Work')).toContainText('16:00 / 25:00');
		await expect(timerBox(secondTab, 'Focus', 'Work')).toContainText('16:00 / 25:00');
	});

	await test.step('Next in one tab ends the work, and its period is saved once', async () => {
		await firstTab.getByRole('button', { name: 'Next' }).click();
		await settle(firstTab);

		const breakBox = secondTab.getByRole('group', { name: 'Break' });
		await expect(breakBox).toBeVisible();
		// 20% of 16 minutes is 3:12.
		await expect(breakBox).toContainText('3:12');
		await expect.poll(async () => (await savedWorkPeriods(firstTab)).length).toBe(1);
		expect(await savedWorkPeriods(secondTab)).toHaveLength(1);
	});

	await test.step('leaving the Timer screen in one tab pauses the run in the other', async () => {
		await expect(secondTab.getByRole('button', { name: 'Pause' })).toBeVisible();

		await followLink(firstTab, screenLink(firstTab, 'Stats'));
		await settle(firstTab);

		await expect(secondTab.getByRole('button', { name: 'Play' })).toBeVisible();
	});

	await test.step('with every tab closed, reopening restores the run paused', async () => {
		// Start the break counting again, so a restore that doesn't pause it would show.
		await secondTab.getByRole('button', { name: 'Play' }).click();
		await settle(secondTab);
		await secondTab.clock.fastForward(seconds(10));
		await expect(secondTab.getByRole('button', { name: 'Pause' })).toBeVisible();
		const context = firstTab.context();
		await secondTab.close();
		await firstTab.close();

		const reopened = await context.newPage();
		await reopened.goto('/');
		await settle(reopened);

		await expect(reopened.getByRole('button', { name: 'Play' })).toBeVisible();
		await expect(reopened.getByRole('combobox', { name: 'Routine' })).toBeDisabled();
		await expect(reopened.getByRole('group', { name: 'Break' })).toBeVisible();
	});
});
