import { readFile } from 'node:fs/promises';
import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';
import { minutes } from '../src/lib/testing/durations';
import { followLink, openOnPausedClock } from './clock';

/**
 * How long the paused clock runs to let the app notice a change saved to storage, in
 * milliseconds. Dexie's live query waits on a timer before telling the app about a change, and
 * the fake clock holds every timer back until it moves.
 */
const SETTLE_MS = 100;

/** The routine titles that every new browser starts with. */
const STARTER_TITLES = ['Classic', 'Classic with long break'];

/**
 * Finds the list of routines on the Routines screen.
 *
 * @param page - The page.
 * @returns The list.
 */
function routineList(page: Page): Locator {
	return page.getByRole('list', { name: 'Routines' });
}

/**
 * Finds the Data card on the Settings screen, which holds the import's messages. The screen has
 * other status and alert regions, such as the volume's reading.
 *
 * @param page - The page, on the Settings screen.
 * @returns The card.
 */
function dataCard(page: Page): Locator {
	return page.getByRole('region', { name: 'Data' });
}

/**
 * Creates a routine of one block on the Routines screen.
 *
 * @param page - The page, on the Routines screen.
 * @param title - The routine's title.
 */
async function createRoutine(page: Page, title: string): Promise<void> {
	await page.getByRole('button', { name: 'New routine' }).click();
	await page.getByRole('textbox', { name: 'Title', exact: true }).fill(title);
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(routineList(page).getByRole('heading', { level: 2, name: title })).toBeVisible();
}

/**
 * Deletes a routine on the Routines screen, confirming the question.
 *
 * @param page - The page, on the Routines screen.
 * @param title - The routine's title.
 */
async function deleteRoutine(page: Page, title: string): Promise<void> {
	await routineList(page)
		.getByRole('listitem', { name: title, exact: true })
		.getByRole('button', { name: 'Delete' })
		.click();
	await page
		.getByRole('dialog', { name: `Delete ${title}?` })
		.getByRole('button', { name: 'Delete' })
		.click();
	await expect(routineList(page).getByRole('heading', { level: 2, name: title })).toHaveCount(0);
}

/**
 * Presses a button that starts a download, and reads the file that comes.
 *
 * @param page - The page, on the Settings screen.
 * @param button - The name of the button to press.
 * @returns The file's suggested name and its text.
 */
async function download(page: Page, button: string): Promise<{ name: string; text: string }> {
	const [file] = await Promise.all([
		page.waitForEvent('download'),
		page.getByRole('button', { name: button }).click()
	]);
	const path = await file.path();
	return { name: file.suggestedFilename(), text: await readFile(path, 'utf8') };
}

/**
 * Chooses a file in the import's file picker.
 *
 * @param page - The page, on the Settings screen.
 * @param text - The file's contents.
 * @param name - The file's name.
 */
async function chooseFile(page: Page, text: string, name = 'backup.json'): Promise<void> {
	await page
		.getByLabel('Import a backup')
		.setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(text) });
}

/**
 * Opens a page in a browser context of its own, which starts with no data, as another device
 * does.
 *
 * @param browser - The browser to make the context in.
 * @param baseURL - The app's address, from the test's configuration.
 * @param path - The app's path to open.
 * @returns The new page.
 */
async function openFreshPage(
	browser: Browser,
	baseURL: string | undefined,
	path: string
): Promise<Page> {
	const context = await browser.newContext({ baseURL });
	const page = await context.newPage();
	await page.goto(path);
	return page;
}

/**
 * Clicks Import in the confirmation, once the file has been checked.
 *
 * @param page - The page.
 */
async function confirmImport(page: Page): Promise<void> {
	await page
		.getByRole('dialog', { name: 'Replace all your data with this backup?' })
		.getByRole('button', { name: 'Import' })
		.click();
}

/**
 * Puts the user's data in the state a backup should carry: routines created, one deleted and one
 * edited, a run of Classic with 26 minutes of work, and the light theme.
 *
 * @param page - A new page, with no data.
 */
async function fillWithData(page: Page): Promise<void> {
	await page.goto('/routines');
	await createRoutine(page, 'Keeper');
	await createRoutine(page, 'Doomed');
	await deleteRoutine(page, 'Doomed');

	await openOnPausedClock(page, '/');
	await page.getByRole('combobox', { name: 'Routine' }).selectOption('Classic');
	await page.getByRole('button', { name: 'Play' }).click();
	await page.clock.fastForward(minutes(26));
	await page.getByRole('button', { name: 'Finish' }).click();
	await page
		.getByRole('dialog', { name: 'Finish this run?' })
		.getByRole('button', { name: 'Finish' })
		.click();
	await page
		.getByRole('dialog', { name: 'Run summary' })
		.getByRole('button', { name: 'Done' })
		.click();

	await followLink(
		page,
		page.getByRole('navigation', { name: 'Screens' }).getByRole('link', { name: 'Settings' })
	);
	await page.getByRole('radio', { name: 'Light' }).check();
	await page.clock.runFor(SETTLE_MS);
}

test('a backup from one browser restores into a fresh one with everything intact', async ({
	page,
	browser,
	baseURL
}) => {
	await fillWithData(page);
	const backup = await download(page, 'Back up (JSON)');

	const fresh = await openFreshPage(browser, baseURL, '/settings');
	await expect(fresh.locator('html')).toHaveAttribute('data-theme', 'dark');

	await test.step('the import shows what the file holds and asks first', async () => {
		await chooseFile(fresh, backup.text, backup.name);

		const dialog = fresh.getByRole('dialog', { name: 'Replace all your data with this backup?' });
		await expect(dialog).toContainText('4 routines, 1 run, 1 work period');
		await dialog.getByRole('button', { name: 'Cancel' }).click();
		await expect(dialog).toBeHidden();
		await expect(fresh.locator('html')).toHaveAttribute('data-theme', 'dark');
	});

	await test.step('confirming replaces the data, theme included', async () => {
		await chooseFile(fresh, backup.text, backup.name);
		await confirmImport(fresh);

		await expect(dataCard(fresh).getByRole('status')).toHaveText(
			'Imported 4 routines, 1 run and 1 work period.'
		);
		await expect(fresh.locator('html')).toHaveAttribute('data-theme', 'light');
		await expect(fresh.getByRole('radio', { name: 'Light' })).toBeChecked();
	});

	await test.step('the routines are the backed-up ones, and the deleted one stays deleted', async () => {
		await fresh
			.getByRole('navigation', { name: 'Screens' })
			.getByRole('link', { name: 'Routines' })
			.click();
		await expect(routineList(fresh).getByRole('heading', { level: 2 })).toHaveText([
			'Keeper',
			...STARTER_TITLES
		]);
		await fresh
			.getByRole('navigation', { name: 'Screens' })
			.getByRole('link', { name: 'Timer' })
			.click();
		await expect(fresh.getByRole('combobox', { name: 'Routine' }).locator('option')).toHaveText([
			'Keeper',
			...STARTER_TITLES
		]);
	});

	await test.step('a new backup of the restored data holds exactly what the first one did', async () => {
		await fresh.goto('/settings');
		const again = await download(fresh, 'Back up (JSON)');

		const original = JSON.parse(backup.text) as Record<string, unknown>;
		const restored = JSON.parse(again.text) as Record<string, unknown>;
		// Only the moment the file was made differs.
		expect({ ...restored, exportedAt: null }).toEqual({ ...original, exportedAt: null });
		expect(original['routines']).toHaveLength(4);
		expect(original['workPeriods']).toHaveLength(1);
	});

	await test.step('the work period is in the CSV export', async () => {
		const csv = await download(fresh, 'Export work periods (CSV)');

		expect(csv.name).toMatch(/^cadoro-work-periods-\d{4}-\d{2}-\d{2}\.csv$/);
		const [header, row] = csv.text.split('\r\n');
		expect(header).toBe('routine,block,started_at,ended_at,worked_seconds,target_minutes');
		expect(row).toMatch(/^Classic,Focus,2026-11-10T09:01:00\.\d{3}Z,.*,1560,25$/);
	});
});

test('a file that is not a valid backup is turned away with its reason, and changes nothing', async ({
	page
}) => {
	await page.goto('/settings');

	await test.step('a file that is not JSON', async () => {
		await chooseFile(page, 'this is not json', 'notes.txt');

		await expect(dataCard(page).getByRole('alert')).toHaveText(
			"This file can't be imported. This file is not valid JSON. Nothing was changed."
		);
		await expect(page.getByRole('dialog')).toHaveCount(0);
	});

	await test.step('a backup from a newer version of the app', async () => {
		const backup = await download(page, 'Back up (JSON)');
		const newer = JSON.stringify({ ...JSON.parse(backup.text), formatVersion: 2 });

		await chooseFile(page, newer);

		await expect(dataCard(page).getByRole('alert')).toContainText(
			'made by a newer version of Cadoro'
		);
		await expect(page.getByRole('dialog')).toHaveCount(0);
	});

	await test.step('a backup with a work period whose run is missing', async () => {
		const backup = JSON.parse((await download(page, 'Back up (JSON)')).text) as {
			workPeriods: unknown[];
		};
		const broken = {
			...backup,
			workPeriods: [
				{
					id: 'p',
					runId: 'missing',
					routineId: 'x',
					blockId: 'b',
					targetMinutes: 25,
					segments: [{ start: '2026-11-10T09:00:00.000Z', end: '2026-11-10T09:25:00.000Z' }],
					workedMs: 1_500_000
				}
			]
		};

		await chooseFile(page, JSON.stringify(broken));

		await expect(dataCard(page).getByRole('alert')).toContainText(
			'workPeriods[0] refers to the run "missing"'
		);
	});

	await test.step('the data is as it was', async () => {
		await page
			.getByRole('navigation', { name: 'Screens' })
			.getByRole('link', { name: 'Routines' })
			.click();
		await expect(routineList(page).getByRole('heading', { level: 2 })).toHaveText(STARTER_TITLES);
	});
});

test('the activity log shows a routine edit and an import, newest first, and exports as JSON', async ({
	page
}) => {
	await page.goto('/settings');
	const backup = await download(page, 'Back up (JSON)');

	await page
		.getByRole('navigation', { name: 'Screens' })
		.getByRole('link', { name: 'Routines' })
		.click();
	await createRoutine(page, 'Logged');
	await page
		.getByRole('navigation', { name: 'Screens' })
		.getByRole('link', { name: 'Settings' })
		.click();
	await chooseFile(page, backup.text, backup.name);
	await confirmImport(page);
	await expect(dataCard(page).getByRole('status')).toContainText('Imported 2 routines');

	await page.getByRole('link', { name: 'Activity log' }).click();

	const entries = page.getByRole('list', { name: 'Log entries' }).getByRole('listitem');
	await expect(entries).toHaveCount(2);
	await expect(entries.nth(0)).toContainText('Imported a backup');
	await expect(entries.nth(1)).toContainText('Created routine "Logged"');

	await entries.nth(0).getByText('Details').click();
	await expect(entries.nth(0)).toContainText('"action": "import"');

	const log = await download(page, 'Export the log (JSON)');
	expect(log.name).toMatch(/^cadoro-activity-log-\d{4}-\d{2}-\d{2}\.json$/);
	const exported = JSON.parse(log.text) as { message: string }[];
	expect(exported.map((entry) => entry.message)).toEqual([
		'Imported a backup',
		'Created routine "Logged"'
	]);
});

test('importing in one tab changes every other tab of the browser', async ({ page, context }) => {
	const secondTab = page;
	await secondTab.goto('/settings');
	const backup = await download(secondTab, 'Back up (JSON)');
	await secondTab.goto('/routines');
	await createRoutine(secondTab, 'Only before the import');

	const firstTab = await context.newPage();
	await firstTab.goto('/');
	await firstTab.getByRole('button', { name: 'Play' }).click();
	await expect(firstTab.getByRole('button', { name: 'Pause' })).toBeVisible();

	await secondTab.goto('/settings');
	await secondTab.getByRole('radio', { name: 'Light' }).check();
	await expect(firstTab.locator('html')).toHaveAttribute('data-theme', 'light');
	await chooseFile(secondTab, backup.text, backup.name);
	await confirmImport(secondTab);
	await expect(dataCard(secondTab).getByRole('status')).toContainText('Imported 2 routines');

	await test.step('the settings, the routines and the run in progress follow in the other tab', async () => {
		await expect(firstTab.locator('html')).toHaveAttribute('data-theme', 'dark');
		await expect(firstTab.getByRole('button', { name: 'Play' })).toBeVisible();
		await expect(firstTab.getByRole('combobox', { name: 'Routine' }).locator('option')).toHaveText(
			STARTER_TITLES
		);
	});
});
