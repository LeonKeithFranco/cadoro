import { expect, test, type Locator, type Page } from '@playwright/test';
import { hours, minutes } from '../src/lib/testing/durations';
import { followLink, openOnPausedClock } from './clock';
import { screenLink } from './screens';
import { closeSummary, finishRun } from './timer';

/** How many days pass between the journey's two runs. */
const DAYS_BETWEEN_RUNS = 10;

/** The hours in one day. */
const HOURS_PER_DAY = 24;

/**
 * Runs a routine on the Timer screen for a while, finishes the run and closes its summary, so
 * its work is saved.
 *
 * @param page - The page, showing the Timer screen on a paused clock.
 * @param routine - The title of the routine to run.
 * @param workMs - How long to work, in milliseconds.
 */
async function runRoutine(page: Page, routine: string, workMs: number): Promise<void> {
	await page.getByRole('combobox', { name: 'Routine' }).selectOption(routine);
	await page.getByRole('button', { name: 'Play' }).click();
	await page.clock.fastForward(workMs);
	await finishRun(page);
	await closeSummary(page);
}

/**
 * Finds a headline figure of the Stats screen by its term.
 *
 * @param page - A page of the app, on the Stats screen with work saved.
 * @param term - The figure's label, such as `Today`.
 * @returns The definition beside the term, which holds the figure's value. A figure's term and
 * definition share one parent, so the term's parent holds only its own definition.
 */
function figureOf(page: Page, term: string): Locator {
	return page
		.getByRole('term')
		.filter({ hasText: new RegExp(`^${term}$`) })
		.locator('..')
		.getByRole('definition');
}

test('work from two routines on two days shows in Stats, and the filter and range change it', async ({
	page
}) => {
	await openOnPausedClock(page, '/');
	const dailyTable = page.getByRole('table', { name: 'Work time per day' });
	const routineFilter = page.getByRole('combobox', { name: 'Routine' });
	const rangeButtons = page.getByRole('group', { name: 'Range' });

	await test.step('with no work yet, Stats says so and links to the Timer', async () => {
		await followLink(page, screenLink(page, 'Stats'));

		await expect(page.getByText('No work yet. Run a routine on the Timer')).toBeVisible();
		await expect(page.getByRole('link', { name: 'Timer', exact: true }).first()).toBeVisible();
		await expect(routineFilter).toBeHidden();
	});

	await test.step('work saved on two days and two routines', async () => {
		await followLink(page, screenLink(page, 'Timer'));
		await runRoutine(page, 'Classic', minutes(25));
		await page.clock.fastForward(hours(HOURS_PER_DAY * DAYS_BETWEEN_RUNS));
		await runRoutine(page, 'Classic with long break', minutes(10));
		await followLink(page, screenLink(page, 'Stats'));

		await expect(page.getByRole('heading', { level: 1, name: 'Stats' })).toBeVisible();
	});

	await test.step('the figures show today, the streaks and all time', async () => {
		await expect(page.getByRole('term')).toHaveText([
			'Today',
			'Current streak',
			'Longest streak',
			'Time against target',
			'Targets reached',
			'All time'
		]);

		await expect(figureOf(page, 'Today')).toHaveText('10:00');
		await expect(figureOf(page, 'Current streak')).toHaveText('1 day');
		await expect(figureOf(page, 'Longest streak')).toHaveText('1 day');
		await expect(figureOf(page, 'All time')).toHaveText('35:00');
	});

	await test.step('the daily chart has a text alternative for the last 7 days', async () => {
		await expect(dailyTable.getByRole('row')).toHaveCount(1 + 7);
		await expect(dailyTable.getByRole('cell', { name: '10:00' })).toHaveCount(1);
		await expect(dailyTable.getByRole('cell', { name: '25:00' })).toHaveCount(0);
	});

	await test.step('all time per routine totals each routine', async () => {
		const perRoutine = page.getByRole('region', { name: 'All time per routine' });

		await expect(perRoutine.getByRole('row', { name: /^Classic 25:00/ })).toBeVisible();
		await expect(
			perRoutine.getByRole('row', { name: /^Classic with long break 10:00/ })
		).toBeVisible();
	});

	await test.step('the 30 days range reaches back to the first run', async () => {
		await rangeButtons.getByRole('button', { name: '30 days' }).click();

		await expect(rangeButtons.getByRole('button', { name: '30 days' })).toHaveAttribute(
			'aria-pressed',
			'true'
		);
		await expect(rangeButtons.getByRole('button', { name: '7 days' })).toHaveAttribute(
			'aria-pressed',
			'false'
		);
		await expect(dailyTable.getByRole('row')).toHaveCount(1 + 30);
		await expect(dailyTable.getByRole('cell', { name: '25:00' })).toHaveCount(1);
		await expect(dailyTable.getByRole('cell', { name: '10:00' })).toHaveCount(1);
	});

	await test.step('the All range starts on the first day with work', async () => {
		await rangeButtons.getByRole('button', { name: 'All' }).click();

		await expect(dailyTable.getByRole('row')).toHaveCount(1 + DAYS_BETWEEN_RUNS + 1);
	});

	await test.step('filtering by a routine narrows every figure and table', async () => {
		await routineFilter.selectOption('Classic');

		await expect(figureOf(page, 'Today')).toHaveText('0:00');
		await expect(figureOf(page, 'Current streak')).toHaveText('0 days');
		await expect(figureOf(page, 'All time')).toHaveText('25:00');
		const perRoutine = page.getByRole('region', { name: 'All time per routine' });
		await expect(perRoutine.getByRole('row')).toHaveCount(1 + 1);
		await expect(perRoutine.getByRole('row', { name: /^Classic 25:00/ })).toBeVisible();
		await expect(dailyTable.getByRole('cell', { name: '10:00' })).toHaveCount(0);
	});

	await test.step('choosing All routines again brings back everything', async () => {
		await routineFilter.selectOption('All routines');

		await expect(figureOf(page, 'All time')).toHaveText('35:00');
		await expect(
			page.getByRole('region', { name: 'All time per routine' }).getByRole('row')
		).toHaveCount(1 + 2);
	});
});
