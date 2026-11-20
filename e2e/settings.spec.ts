import { expect, test, type Page } from '@playwright/test';
import {
	chimeStarts,
	fakePersistentStorage,
	fakeWakeLock,
	recordChimes,
	removeWakeLock,
	setVisibility,
	wakeLockLog
} from './browser-apis';
import { followLink, openOnPausedClock } from './clock';
import { openSettings, screenLink, type ScreenName } from './screens';
import { hasSavedRunInProgress, savedSettingsRow } from './storage';
import { closeSummary, finishRun } from './timer';

/**
 * Follows a link in the navigation on a paused clock, and waits for the screen to show.
 *
 * @param page - The page, on a paused clock.
 * @param screen - The screen's name: its link and its heading.
 */
async function goToScreen(page: Page, screen: ScreenName): Promise<void> {
	await followLink(page, screenLink(page, screen));
	await expect(page.getByRole('heading', { level: 1, name: screen })).toBeVisible();
}

test.describe('the Settings screen', () => {
	test('starts on the defaults: dark, the first chime for both alerts, 70% volume, awake on', async ({
		page
	}) => {
		await openSettings(page);

		await expect(page.getByRole('radio', { name: 'Dark' })).toBeChecked();
		await expect(page.getByRole('combobox', { name: 'Work target chime' })).toHaveValue(
			'bell-ding-1'
		);
		await expect(page.getByRole('combobox', { name: 'Break chime' })).toHaveValue('bell-ding-1');
		await expect(page.getByRole('slider', { name: 'Volume' })).toHaveValue('70');
		await expect(page.getByText('70%')).toBeVisible();
		await expect(
			page.getByRole('checkbox', { name: 'Keep the screen awake during a run' })
		).toBeChecked();
	});

	test('every setting is kept after a reload', async ({ page }) => {
		await openSettings(page);

		await page.getByRole('radio', { name: 'Light' }).check();
		await page.getByRole('combobox', { name: 'Work target chime' }).selectOption('bell-ding-2');
		await page.getByRole('combobox', { name: 'Break chime' }).selectOption('bell-ding-4');
		await page.getByRole('slider', { name: 'Volume' }).fill('35');
		await page.getByRole('checkbox', { name: 'Keep the screen awake during a run' }).uncheck();
		await expect
			.poll(() => savedSettingsRow(page))
			.toEqual({
				theme: 'light',
				targetChime: 'bell-ding-2',
				breakChime: 'bell-ding-4',
				volume: 35,
				keepScreenAwake: false
			});
		await page.reload();

		await expect(page.getByRole('radio', { name: 'Light' })).toBeChecked();
		await expect(page.getByRole('combobox', { name: 'Work target chime' })).toHaveValue(
			'bell-ding-2'
		);
		await expect(page.getByRole('combobox', { name: 'Break chime' })).toHaveValue('bell-ding-4');
		await expect(page.getByRole('slider', { name: 'Volume' })).toHaveValue('35');
		await expect(page.getByText('35%')).toBeVisible();
		await expect(
			page.getByRole('checkbox', { name: 'Keep the screen awake during a run' })
		).not.toBeChecked();
	});

	test('choosing Light changes the page at once, without a reload', async ({ page }) => {
		await openSettings(page);
		await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

		await page.getByRole('radio', { name: 'Light' }).check();

		await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
		await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
	});

	test('a change in one tab shows in another tab’s Settings and theme', async ({ page }) => {
		await openSettings(page);
		const otherTab = await page.context().newPage();
		await openSettings(otherTab);

		await page.getByRole('radio', { name: 'Light' }).check();
		await page.getByRole('slider', { name: 'Volume' }).fill('20');

		await expect(otherTab.getByRole('radio', { name: 'Light' })).toBeChecked();
		await expect(otherTab.locator('html')).toHaveAttribute('data-theme', 'light');
		await expect(otherTab.getByRole('slider', { name: 'Volume' })).toHaveValue('20');
		await expect(otherTab.getByText('20%')).toBeVisible();
	});

	test.describe('previewing a chime', () => {
		test('plays the chime chosen for that alert at once, on the press alone, and changes no setting', async ({
			page
		}) => {
			await recordChimes(page);
			await openSettings(page);
			await page.getByRole('combobox', { name: 'Break chime' }).selectOption('bell-ding-3');
			await expect.poll(() => savedSettingsRow(page)).toEqual({ breakChime: 'bell-ding-3' });
			expect(await chimeStarts(page)).toEqual([]);

			await page.getByRole('button', { name: 'Preview break chime' }).click();

			await expect
				.poll(() => chimeStarts(page))
				.toEqual([{ kind: 'start', file: '/chimes/bell-ding-3.mp3', whenMs: 0 }]);
			expect(await savedSettingsRow(page)).toEqual({ breakChime: 'bell-ding-3' });
		});

		test('plays each alert’s own chime, and the one just chosen', async ({ page }) => {
			await recordChimes(page);
			await openSettings(page);

			await page.getByRole('combobox', { name: 'Work target chime' }).selectOption('bell-ding-2');
			// Each preview loads its file before it plays, so a second click before the first chime
			// has started could play them in either order.
			await page.getByRole('button', { name: 'Preview work target chime' }).click();
			await expect
				.poll(async () => (await chimeStarts(page)).map((chime) => chime.file))
				.toEqual(['/chimes/bell-ding-2.mp3']);
			await page.getByRole('button', { name: 'Preview break chime' }).click();

			await expect
				.poll(async () => (await chimeStarts(page)).map((chime) => chime.file))
				.toEqual(['/chimes/bell-ding-2.mp3', '/chimes/bell-ding-1.mp3']);
		});
	});

	test.describe('keeping the screen awake', () => {
		test('is asked for while a timer counts, let go on Pause, when the page is hidden and on leaving the Timer, and asked for again when the page is visible', async ({
			page
		}) => {
			await fakeWakeLock(page);
			await openOnPausedClock(page, '/');
			await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
			expect(await wakeLockLog(page)).toEqual({ requests: 0, releases: 0 });

			await page.getByRole('button', { name: 'Play' }).click();
			await expect.poll(() => wakeLockLog(page)).toEqual({ requests: 1, releases: 0 });

			await page.getByRole('button', { name: 'Pause' }).click();
			await expect.poll(() => wakeLockLog(page)).toEqual({ requests: 1, releases: 1 });

			await page.getByRole('button', { name: 'Play' }).click();
			await expect.poll(() => wakeLockLog(page)).toEqual({ requests: 2, releases: 1 });

			await setVisibility(page, 'hidden');
			await expect.poll(() => wakeLockLog(page)).toEqual({ requests: 2, releases: 2 });
			await setVisibility(page, 'visible');
			await expect.poll(() => wakeLockLog(page)).toEqual({ requests: 3, releases: 2 });

			// Leaving the Timer pauses the run.
			await goToScreen(page, 'Settings');
			await expect.poll(() => wakeLockLog(page)).toEqual({ requests: 3, releases: 3 });
		});

		test('is not asked for while the setting is off', async ({ page }) => {
			await fakeWakeLock(page);
			await openOnPausedClock(page, '/');
			await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
			await goToScreen(page, 'Settings');
			await page.getByRole('checkbox', { name: 'Keep the screen awake during a run' }).uncheck();
			await goToScreen(page, 'Timer');

			await page.getByRole('button', { name: 'Play' }).click();

			await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
			expect(await wakeLockLog(page)).toEqual({ requests: 0, releases: 0 });
		});

		test('says it isn’t supported, and can’t be changed, in a browser without a wake lock', async ({
			page
		}) => {
			await removeWakeLock(page);

			await openSettings(page);

			const checkbox = page.getByRole('checkbox', { name: 'Keep the screen awake during a run' });
			await expect(checkbox).toBeDisabled();
			await expect(page.getByText("This browser can't keep the screen awake")).toBeVisible();
		});
	});

	test.describe('persistent storage', () => {
		test('shows it off, and Ask again turns it on once the browser grants it', async ({ page }) => {
			await fakePersistentStorage(page, { isPersistent: false, willGrant: true });
			await openSettings(page);
			await expect(page.getByText('Off', { exact: true })).toBeVisible();

			await page.getByRole('button', { name: 'Ask again' }).click();

			await expect(page.getByText('On', { exact: true })).toBeVisible();
			await expect(page.getByRole('button', { name: 'Ask again' })).toBeHidden();
		});
	});
});

test.describe('the Timer screen’s routine', () => {
	test('opens on the routine the last run used, and not on one only chosen', async ({ page }) => {
		await openOnPausedClock(page, '/');
		const picker = page.getByRole('combobox', { name: 'Routine' });
		const chosen = picker.locator('option:checked');
		await expect(chosen).toHaveText('Classic');

		await test.step('choosing a routine without starting a run changes nothing after a reload', async () => {
			await picker.selectOption({ label: 'Classic with long break' });

			await page.reload();

			await expect(chosen).toHaveText('Classic');
		});

		await test.step('a run started with the routine makes it the one the Timer opens on', async () => {
			await picker.selectOption({ label: 'Classic with long break' });
			await page.getByRole('button', { name: 'Play' }).click();
			await expect.poll(() => savedSettingsRow(page)).toHaveProperty('lastRoutineId');

			await finishRun(page);
			await closeSummary(page);
			// Done forgets the ended run, which would otherwise come back after the reload with its own
			// routine, whatever the Timer opens on.
			await expect.poll(() => hasSavedRunInProgress(page)).toBe(false);
			await page.reload();

			await expect(chosen).toHaveText('Classic with long break');
			await expect(picker).toBeEnabled();
		});
	});
});
