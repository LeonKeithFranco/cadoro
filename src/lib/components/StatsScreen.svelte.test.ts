import { page, type Locator } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { minutes } from '../testing/durations';
import { routineWith } from '../testing/routines';
import { workPeriodWith } from '../testing/run-records';
import StatsScreen from './StatsScreen.svelte';

/**
 * Makes a work period of one unpaused segment, so a test writes just its routine, times and
 * target. The worked time is the segment's length.
 *
 * @param routineId - The routine it belongs to.
 * @param start - When it started, as a UTC timestamp.
 * @param end - When it ended, as a UTC timestamp.
 * @param workedMs - The milliseconds between them.
 * @param targetMinutes - Its target in minutes.
 * @returns The work period.
 */
function period(
	routineId: string,
	start: string,
	end: string,
	workedMs: number,
	targetMinutes: number
): ReturnType<typeof workPeriodWith> {
	return workPeriodWith({ routineId, targetMinutes, segments: [{ start, end }], workedMs });
}

/** The routines of the data below. */
const routines = [
	routineWith({ id: 'focus', title: 'Focus' }),
	routineWith({ id: 'reading', title: 'Reading' })
];

/**
 * Work around midday UTC, so every browser time zone from UTC-11 to UTC+11 sees it on the same
 * local day: Oct 14 (10 of 25 minutes), Nov 18 (25 of 25) and Nov 19 (30 of 25) in Focus, and
 * Nov 19 (40 of 50) in Reading.
 */
const workPeriods = [
	period('focus', '2026-10-14T12:00:00.000Z', '2026-10-14T12:10:00.000Z', minutes(10), 25),
	period('focus', '2026-11-18T12:00:00.000Z', '2026-11-18T12:25:00.000Z', minutes(25), 25),
	period('focus', '2026-11-19T11:00:00.000Z', '2026-11-19T11:30:00.000Z', minutes(30), 25),
	period('reading', '2026-11-19T11:40:00.000Z', '2026-11-19T12:20:00.000Z', minutes(40), 50)
];

/** Thursday Nov 19 2026, shortly after the last work period. */
const NOW = Date.parse('2026-11-19T12:30:00Z');

/**
 * Shows the screen with the data above, unless a test says otherwise.
 *
 * @param data - The props that differ from the data above.
 */
function renderStats(data: Partial<{ workPeriods: typeof workPeriods }> = {}): void {
	render(StatsScreen, { workPeriods, routines, now: NOW, ...data });
}

/**
 * Finds the value of one headline figure.
 *
 * @param label - The figure's label, such as "Today".
 * @returns A function that reads its value, for `expect.poll`, which keeps asking until the screen
 * shows it. It throws until the figure is on the screen.
 */
function figure(label: string): () => string | undefined {
	return () => page.getByText(label, { exact: true }).element().nextElementSibling?.textContent;
}

/**
 * Finds the row of a card's table.
 *
 * @param card - The card's heading, such as "Weekly totals".
 * @param rowName - Text in the row, such as the week's label.
 * @returns The locator of the row.
 */
function rowOf(card: string, rowName: string): Locator {
	return page.getByRole('region', { name: card }).getByRole('row', { name: rowName });
}

/** The visually hidden table that gives the chart's values. */
const chartTable = (): Locator => page.getByRole('table', { name: 'Work time per day' });

describe('the Stats screen with work saved', () => {
	it("shows today's work", async () => {
		renderStats();

		await expect.poll(figure('Today')).toBe('1:10:00');
	});

	it('shows the current and longest streaks', async () => {
		renderStats();

		await expect.poll(figure('Current streak')).toBe('2 days');
		await expect.poll(figure('Longest streak')).toBe('2 days');
	});

	it('shows time against target and targets reached', async () => {
		renderStats();

		await expect.poll(figure('Time against target')).toBe('84%');
		await expect.poll(figure('Targets reached')).toBe('50%');
	});

	it('shows all time work', async () => {
		renderStats();

		await expect.poll(figure('All time')).toBe('1:45:00');
	});

	it('shows the weekly totals, newest first, with weeks starting on Monday', async () => {
		renderStats();

		await expect
			.element(rowOf('Weekly totals', 'Week of Nov 16, 2026'))
			.toHaveTextContent('1:35:00');
		await expect.element(rowOf('Weekly totals', 'Week of Oct 12, 2026')).toHaveTextContent('10:00');
	});

	it('shows the monthly totals', async () => {
		renderStats();

		await expect.element(rowOf('Monthly totals', 'November 2026')).toHaveTextContent('1:35:00');
		await expect.element(rowOf('Monthly totals', 'October 2026')).toHaveTextContent('10:00');
	});

	it('shows all time per routine, including a deleted routine by name', async () => {
		const deleted = routineWith({
			id: 'old',
			title: 'Old routine',
			deletedAt: '2026-11-01T12:00:00.000Z'
		});
		render(StatsScreen, {
			workPeriods: [
				...workPeriods,
				period('old', '2026-11-17T12:00:00.000Z', '2026-11-17T12:05:00.000Z', minutes(5), 25)
			],
			routines: [...routines, deleted],
			now: NOW
		});

		await expect.element(rowOf('All time per routine', 'Focus')).toHaveTextContent('1:05:00');
		await expect.element(rowOf('All time per routine', 'Reading')).toHaveTextContent('40:00');
		await expect
			.element(rowOf('All time per routine', 'Old routine (deleted)'))
			.toHaveTextContent('5:00');
	});
});

describe('the daily chart', () => {
	it('draws the chart, hidden from assistive technology', async () => {
		renderStats();

		await expect.element(page.getByRole('heading', { name: 'Daily work time' })).toBeVisible();
		// The bars are in an `aria-hidden` element, so only a query of the page's markup finds them.
		await expect.poll(() => document.querySelector('[aria-hidden="true"] svg')).not.toBeNull();
	});

	it("gives the chart's values as a table for screen readers, day by day", async () => {
		renderStats();

		await expect
			.element(chartTable().getByRole('row', { name: 'Nov 19' }))
			.toHaveTextContent('1:10:00');
		await expect
			.element(chartTable().getByRole('row', { name: 'Nov 18' }))
			.toHaveTextContent('25:00');
		await expect
			.element(chartTable().getByRole('row', { name: 'Nov 17' }))
			.toHaveTextContent('0:00');
	});

	it('names each day of the table with its year, so All over several years has no repeats', async () => {
		render(StatsScreen, {
			workPeriods: [
				period('focus', '2025-11-19T12:00:00.000Z', '2025-11-19T12:10:00.000Z', minutes(10), 25),
				...workPeriods
			],
			routines,
			now: NOW
		});

		await page.getByRole('button', { name: 'All' }).click();

		await expect
			.element(chartTable().getByRole('row', { name: 'Nov 19, 2025' }))
			.toHaveTextContent('10:00');
		await expect
			.element(chartTable().getByRole('row', { name: 'Nov 19, 2026' }))
			.toHaveTextContent('1:10:00');
	});

	it('starts on 7 days: a header row and a row for each day', async () => {
		renderStats();

		await expect.element(page.getByRole('button', { name: '7 days', pressed: true })).toBeVisible();
		await expect.poll(() => chartTable().getByRole('row').elements()).toHaveLength(8);
	});

	it.each<[button: string, days: number]>([
		['30 days', 30],
		['90 days', 90],
		['1 year', 365],
		// Oct 14 to Nov 19 is 37 days, counting both.
		['All', 37]
	])('shows %s as a row for each of its %i days', async (button, days) => {
		renderStats();

		await page.getByRole('button', { name: button }).click();

		await expect.element(page.getByRole('button', { name: button, pressed: true })).toBeVisible();
		await expect.poll(() => chartTable().getByRole('row').elements()).toHaveLength(days + 1);
	});
});

describe('the routine filter', () => {
	it('starts on all routines', async () => {
		renderStats();

		await expect.element(page.getByRole('combobox', { name: 'Routine' })).toHaveValue('');
	});

	it('narrows every section to the chosen routine', async () => {
		renderStats();

		await page.getByRole('combobox', { name: 'Routine' }).selectOptions('Focus');

		await expect.poll(figure('Today')).toBe('30:00');
		await expect.poll(figure('Time against target')).toBe('87%');
		await expect.poll(figure('Targets reached')).toBe('67%');
		await expect.poll(figure('All time')).toBe('1:05:00');
		await expect.element(rowOf('Weekly totals', 'Week of Nov 16, 2026')).toHaveTextContent('55:00');
		await expect.element(rowOf('Monthly totals', 'November 2026')).toHaveTextContent('55:00');
		await expect
			.element(chartTable().getByRole('row', { name: 'Nov 19' }))
			.toHaveTextContent('30:00');
		await expect.element(rowOf('All time per routine', 'Focus')).toBeVisible();
		await expect.element(rowOf('All time per routine', 'Reading')).not.toBeInTheDocument();
	});

	it('labels a deleted routine "(deleted)" in the filter, and filters by it', async () => {
		const deleted = routineWith({
			id: 'old',
			title: 'Old routine',
			deletedAt: '2026-11-01T12:00:00.000Z'
		});
		render(StatsScreen, {
			workPeriods: [
				...workPeriods,
				period('old', '2026-11-17T12:00:00.000Z', '2026-11-17T12:05:00.000Z', minutes(5), 25)
			],
			routines: [...routines, deleted],
			now: NOW
		});

		await expect
			.element(page.getByRole('option', { name: 'Old routine (deleted)' }))
			.toBeInTheDocument();
		await expect.element(page.getByRole('option', { name: 'Focus' })).toBeInTheDocument();

		await page.getByRole('combobox', { name: 'Routine' }).selectOptions('Old routine (deleted)');

		await expect.poll(figure('All time')).toBe('5:00');
	});

	it('shows no work in the sections of a routine that has none, rather than the empty state', async () => {
		render(StatsScreen, {
			workPeriods,
			routines: [...routines, routineWith({ id: 'new', title: 'New routine' })],
			now: NOW
		});

		await page.getByRole('combobox', { name: 'Routine' }).selectOptions('New routine');

		await expect.poll(figure('Today')).toBe('0:00');
		await expect.poll(figure('Time against target')).toBe('-');
		await expect.element(page.getByText('No work yet.').first()).toBeVisible();
		await expect.element(page.getByRole('combobox', { name: 'Routine' })).toBeVisible();
	});
});

describe('the Stats screen with no work saved', () => {
	it('says there is no work yet and points to the Timer', async () => {
		renderStats({ workPeriods: [] });

		await expect.element(page.getByText('No work yet.', { exact: false })).toBeVisible();
		await expect.element(page.getByRole('link', { name: 'Timer' })).toBeVisible();
	});

	it('shows none of the sections', async () => {
		renderStats({ workPeriods: [] });

		await expect.element(page.getByRole('heading', { name: 'Stats' })).toBeVisible();
		await expect
			.element(page.getByRole('heading', { name: 'Daily work time' }))
			.not.toBeInTheDocument();
		await expect.element(page.getByRole('combobox', { name: 'Routine' })).not.toBeInTheDocument();
	});
});
