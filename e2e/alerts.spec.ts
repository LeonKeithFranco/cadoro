import { expect, test, type Locator, type Page } from '@playwright/test';
import { minutes, seconds } from '../src/lib/testing/durations';
import { chimeEvents, chimeStarts, recordChimes } from './browser-apis';
import { openOnPausedClock } from './clock';
import { saveSettingsRow } from './storage';

/** The file of the chime chosen for the work target in these journeys. */
const TARGET_CHIME_FILE = '/chimes/bell-ding-2.mp3';

/** The file of the chime chosen for the end of a break in these journeys. */
const BREAK_CHIME_FILE = '/chimes/bell-ding-3.mp3';

/**
 * Reads the page's clock, which the journey moves by hand.
 *
 * @param page - The page to read.
 * @returns The page's current moment, in milliseconds since 1970 (UTC).
 */
async function pageNow(page: Page): Promise<number> {
	return page.evaluate(() => Date.now());
}

/**
 * Finds a box of the Focus routine's card.
 *
 * @param page - A page of the app on the Timer screen.
 * @param label - The box, `Work` or `Break`, which its name starts with.
 * @returns The box, named by its label, such as "Work · Overtime".
 */
function box(page: Page, label: 'Work' | 'Break'): Locator {
	return page
		.getByRole('region', { name: 'Focus' })
		.getByRole('group', { name: new RegExp(`^${label}`) });
}

/**
 * Opens the app on a paused clock with the chimes recorded, and chosen chimes saved, so each
 * alert's chime can be told apart.
 *
 * @param page - The page to open.
 */
async function openWithChosenChimes(page: Page): Promise<void> {
	await recordChimes(page);
	await openOnPausedClock(page, '/');
	// The app renders once its database is open and upgraded, which the row needs.
	await expect(page.getByRole('navigation', { name: 'Screens' })).toBeVisible();
	await saveSettingsRow(page, { targetChime: 'bell-ding-2', breakChime: 'bell-ding-3' });
	// The clock carries on across a reload, and the app reads the saved settings as it opens.
	await page.reload();
}

test.describe('the alerts', () => {
	test('a work period’s chime is due as it reaches its target, and a break’s as it ends, each with its chosen chime', async ({
		page
	}) => {
		await openWithChosenChimes(page);

		await test.step('Play at 9:01 schedules the target chime for 9:26, 25 minutes on', async () => {
			expect(await pageNow(page)).toBe(Date.parse('2026-11-10T09:01:00Z'));
			await page.getByRole('button', { name: 'Play' }).click();

			await expect.poll(async () => (await chimeStarts(page)).length).toBe(1);
			expect(await chimeStarts(page)).toEqual([
				{ kind: 'start', file: TARGET_CHIME_FILE, whenMs: Date.parse('2026-11-10T09:26:00Z') }
			]);
		});

		await test.step('the work reaches its target at 9:26, the chime’s moment', async () => {
			await page.clock.fastForward(minutes(24) + seconds(59));
			expect(await pageNow(page)).toBe(Date.parse('2026-11-10T09:25:59Z'));
			await expect(box(page, 'Work')).toContainText('24:59 / 25:00');

			await page.clock.fastForward(seconds(1));

			expect(await pageNow(page)).toBe(Date.parse('2026-11-10T09:26:00Z'));
			await expect(box(page, 'Work')).toContainText('25:00 / 25:00');
		});

		await test.step('Next at 9:26 schedules the break chime for 9:31, as the 5 minute break ends', async () => {
			await page.getByRole('button', { name: 'Next' }).click();

			await expect.poll(async () => (await chimeStarts(page)).length).toBe(2);
			expect((await chimeStarts(page))[1]).toEqual({
				kind: 'start',
				file: BREAK_CHIME_FILE,
				whenMs: Date.parse('2026-11-10T09:31:00Z')
			});
		});

		await test.step('the break reaches 0:00 at 9:31, the chime’s moment', async () => {
			await page.clock.fastForward(minutes(4) + seconds(59));
			expect(await pageNow(page)).toBe(Date.parse('2026-11-10T09:30:59Z'));
			await expect(box(page, 'Break')).toContainText('0:01');

			await page.clock.fastForward(seconds(1));

			expect(await pageNow(page)).toBe(Date.parse('2026-11-10T09:31:00Z'));
			await expect(box(page, 'Break')).toContainText('0:00');
			expect(await chimeStarts(page)).toHaveLength(2);
		});

		await test.step('Play at 9:31 starts the next work period with its target chime at 9:56', async () => {
			await page.getByRole('button', { name: 'Play' }).click();

			await expect.poll(async () => (await chimeStarts(page)).length).toBe(3);
			expect((await chimeStarts(page))[2]).toEqual({
				kind: 'start',
				file: TARGET_CHIME_FILE,
				whenMs: Date.parse('2026-11-10T09:56:00Z')
			});
		});
	});

	test('Pause takes back the scheduled chime, and Play schedules it again from the work left', async ({
		page
	}) => {
		await openWithChosenChimes(page);
		await page.getByRole('button', { name: 'Play' }).click();
		await expect.poll(async () => (await chimeStarts(page)).length).toBe(1);

		await page.clock.fastForward(minutes(10));
		await page.getByRole('button', { name: 'Pause' }).click();

		await expect
			.poll(async () => (await chimeEvents(page)).map((event) => event.kind))
			.toEqual(['start', 'stop']);
		expect((await chimeEvents(page))[1]?.file).toBe(TARGET_CHIME_FILE);

		// Played at 9:01 and paused at 9:11, then 5 minutes paused, which don't count as work, so
		// Play at 9:16 leaves 15 of the 25 minutes, to 9:31.
		await page.clock.fastForward(minutes(5));
		await page.getByRole('button', { name: 'Play' }).click();

		await expect.poll(async () => (await chimeStarts(page)).length).toBe(2);
		expect((await chimeStarts(page))[1]).toEqual({
			kind: 'start',
			file: TARGET_CHIME_FILE,
			whenMs: Date.parse('2026-11-10T09:31:00Z')
		});
	});

	test('a run restored after a reload schedules its chime from the work it had once Play is pressed', async ({
		page
	}) => {
		await openWithChosenChimes(page);
		await page.getByRole('button', { name: 'Play' }).click();
		await expect.poll(async () => (await chimeStarts(page)).length).toBe(1);
		await page.clock.fastForward(minutes(10));

		await page.reload();
		await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
		await expect(box(page, 'Work')).toContainText('10:00 / 25:00');
		// Played at 9:01 and restored at 9:11 with 10 minutes worked, so Play at 9:16 leaves 15
		// minutes, to 9:31.
		await page.clock.fastForward(minutes(5));
		await page.getByRole('button', { name: 'Play' }).click();

		await expect.poll(async () => (await chimeStarts(page)).length).toBe(1);
		expect(await chimeStarts(page)).toEqual([
			{ kind: 'start', file: TARGET_CHIME_FILE, whenMs: Date.parse('2026-11-10T09:31:00Z') }
		]);
	});

	test('the default chime sounds for both alerts when none has been chosen', async ({ page }) => {
		await recordChimes(page);
		await openOnPausedClock(page, '/');
		await page.getByRole('button', { name: 'Play' }).click();
		await expect.poll(async () => (await chimeStarts(page)).length).toBe(1);
		await page.clock.fastForward(minutes(25));
		await page.getByRole('button', { name: 'Next' }).click();

		await expect.poll(async () => (await chimeStarts(page)).length).toBe(2);

		expect((await chimeStarts(page)).map((event) => event.file)).toEqual([
			'/chimes/bell-ding-1.mp3',
			'/chimes/bell-ding-1.mp3'
		]);
	});
});
