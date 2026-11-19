import { expect, test, type Locator, type Page } from '@playwright/test';
import { minutes } from '../src/lib/testing/durations';
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

		await test.step('Play schedules the target chime for 25 minutes ahead', async () => {
			await page.getByRole('button', { name: 'Play' }).click();

			await expect.poll(async () => (await chimeStarts(page)).length).toBe(1);
			const playedAt = await pageNow(page);
			expect(await chimeStarts(page)).toEqual([
				{ kind: 'start', file: TARGET_CHIME_FILE, whenMs: playedAt + minutes(25) }
			]);
		});

		await test.step('the chime’s moment is the one the work reaches its target', async () => {
			const [targetChime] = await chimeStarts(page);

			await page.clock.fastForward(minutes(25));

			await expect(box(page, 'Work')).toContainText('25:00 / 25:00');
			expect(await pageNow(page)).toBe(targetChime?.whenMs);
		});

		await test.step('Next schedules the break chime for when the 5 minute break ends', async () => {
			await page.getByRole('button', { name: 'Next' }).click();

			await expect.poll(async () => (await chimeStarts(page)).length).toBe(2);
			const startedBreakAt = await pageNow(page);
			expect((await chimeStarts(page))[1]).toEqual({
				kind: 'start',
				file: BREAK_CHIME_FILE,
				whenMs: startedBreakAt + minutes(5)
			});
		});

		await test.step('the chime’s moment is the one the break reaches 0:00', async () => {
			const breakChime = (await chimeStarts(page))[1];

			await page.clock.fastForward(minutes(5));

			await expect(box(page, 'Break')).toContainText('0:00');
			expect(await pageNow(page)).toBe(breakChime?.whenMs);
			expect(await chimeStarts(page)).toHaveLength(2);
		});

		await test.step('Play then starts the next work period with the target chime again', async () => {
			await page.getByRole('button', { name: 'Play' }).click();

			await expect.poll(async () => (await chimeStarts(page)).length).toBe(3);
			const startedAt = await pageNow(page);
			expect((await chimeStarts(page))[2]).toEqual({
				kind: 'start',
				file: TARGET_CHIME_FILE,
				whenMs: startedAt + minutes(25)
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

		// 5 minutes paused don't count as work, so 15 of the 25 minutes are left.
		await page.clock.fastForward(minutes(5));
		await page.getByRole('button', { name: 'Play' }).click();

		await expect.poll(async () => (await chimeStarts(page)).length).toBe(2);
		const resumedAt = await pageNow(page);
		expect((await chimeStarts(page))[1]).toEqual({
			kind: 'start',
			file: TARGET_CHIME_FILE,
			whenMs: resumedAt + minutes(15)
		});
	});

	test('a run restored after a reload schedules no chime until Play, and then counts the work it had', async ({
		page
	}) => {
		await openWithChosenChimes(page);
		await page.getByRole('button', { name: 'Play' }).click();
		await expect.poll(async () => (await chimeStarts(page)).length).toBe(1);
		await page.clock.fastForward(minutes(10));

		await page.reload();

		await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
		await expect(box(page, 'Work')).toContainText('10:00 / 25:00');
		expect(await chimeEvents(page)).toEqual([]);

		await page.getByRole('button', { name: 'Play' }).click();

		await expect.poll(async () => (await chimeStarts(page)).length).toBe(1);
		const resumedAt = await pageNow(page);
		expect(await chimeStarts(page)).toEqual([
			{ kind: 'start', file: TARGET_CHIME_FILE, whenMs: resumedAt + minutes(15) }
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
