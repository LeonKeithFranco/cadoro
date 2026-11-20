import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { BlockView, TimerBoxView } from '../block-view';
// The app's styles, since the bar's size comes from its classes.
import '../../routes/layout.css';
import BlockCard from './BlockCard.svelte';

/** A work box counting up, halfway to its target. */
const workingBox: TimerBoxView = {
	label: 'Work',
	time: '12:30',
	target: '25:00',
	isActive: true,
	isOvertime: false,
	progressPercent: 50
};

/** The break box below it, showing the break earned so far. */
const breakEarnedBox: TimerBoxView = {
	label: 'Break earned',
	time: '2:30',
	target: null,
	isActive: false,
	isOvertime: false,
	progressPercent: 0
};

/**
 * Makes a card's view for the Focus block, written by hand because the card only lays out what
 * it's given. `viewBlock`'s own tests cover what it's given.
 *
 * @param changes - What to show in place of the second of three cycles, a work box at 12:30 and
 * the break earned.
 * @returns The block's view.
 */
function focusBlock(changes: Partial<Pick<BlockView, 'cycle' | 'work' | 'break'>> = {}): BlockView {
	return {
		title: 'Focus',
		summary: '25 min · 20% break',
		cycle: 'Cycle 2 / 3',
		work: workingBox,
		break: breakEarnedBox,
		...changes
	};
}

/**
 * Measures how much of a bar's track its fill covers, from their rendered sizes.
 *
 * @param fill - The bar's fill.
 * @param track - The bar's track, whose inner width the fill is a share of. Its border is left out.
 * @returns The fill's width as a fraction of the track's inner width, from 0 to 1.
 */
function filledShare(fill: Element, track: Element): number {
	return fill.getBoundingClientRect().width / track.clientWidth;
}

describe('a block card', () => {
	it("is a region named after the block, with the block's target and break", async () => {
		render(BlockCard, { block: focusBlock() });

		const card = page.getByRole('region', { name: 'Focus' });
		await expect.element(card.getByRole('heading', { level: 2, name: 'Focus' })).toBeVisible();
		await expect.element(card.getByText('25 min · 20% break')).toBeVisible();
	});

	it('shows the cycle the run is on', async () => {
		render(BlockCard, { block: focusBlock() });

		await expect
			.element(page.getByRole('region', { name: 'Focus' }).getByText('Cycle 2 / 3'))
			.toBeVisible();
	});

	it('shows no cycle counter for a block of one cycle', async () => {
		render(BlockCard, { block: focusBlock({ cycle: null }) });

		await expect.element(page.getByRole('heading', { name: 'Focus' })).toBeVisible();
		await expect.element(page.getByText(/Cycle/)).not.toBeInTheDocument();
	});

	it('shows the work box with its target, and the break box below it', async () => {
		render(BlockCard, { block: focusBlock() });

		const workBox = page.getByRole('group', { name: 'Work' });
		const breakBox = page.getByRole('group', { name: 'Break earned' });
		await expect.element(workBox).toHaveTextContent('12:30 / 25:00');
		await expect.element(breakBox).toHaveTextContent('2:30');
		const workTop = workBox.element().getBoundingClientRect().top;
		const breakTop = breakBox.element().getBoundingClientRect().top;
		expect(workTop).toBeLessThan(breakTop);
	});

	it('marks only the box in use as current', async () => {
		render(BlockCard, { block: focusBlock() });

		await expect
			.element(page.getByRole('group', { name: 'Work' }))
			.toHaveAttribute('aria-current', 'true');
		await expect
			.element(page.getByRole('group', { name: 'Break earned' }))
			.not.toHaveAttribute('aria-current');
	});

	it('names overtime in words, not only by colour', async () => {
		const overtimeBox: TimerBoxView = {
			...workingBox,
			label: 'Work · Overtime',
			time: '31:40',
			isOvertime: true,
			progressPercent: 100
		};
		render(BlockCard, { block: focusBlock({ work: overtimeBox }) });

		await expect
			.element(page.getByRole('group', { name: 'Work · Overtime' }))
			.toHaveTextContent('31:40 / 25:00');
	});

	it("fills each box's bar by its progress", async () => {
		const countingDownBox: TimerBoxView = {
			label: 'Break',
			time: '3:00',
			target: null,
			isActive: true,
			isOvertime: false,
			progressPercent: 60
		};
		render(BlockCard, { block: focusBlock({ break: countingDownBox }) });

		const workFill = page.getByRole('group', { name: 'Work' }).getByTestId('progress-fill');
		const breakFill = page.getByRole('group', { name: 'Break' }).getByTestId('progress-fill');
		const workTrack = page.getByRole('progressbar', { name: 'Work' });
		const breakTrack = page.getByRole('progressbar', { name: 'Break' });
		expect(filledShare(workFill.element(), workTrack.element())).toBeCloseTo(0.5, 2);
		expect(filledShare(breakFill.element(), breakTrack.element())).toBeCloseTo(0.6, 2);
	});

	it("gives each box's bar a progressbar role, named by the box, with its value as a percentage", async () => {
		render(BlockCard, { block: focusBlock() });

		const workBar = page.getByRole('progressbar', { name: 'Work' });
		await expect.element(workBar).toHaveAttribute('aria-valuemin', '0');
		await expect.element(workBar).toHaveAttribute('aria-valuemax', '100');
		await expect.element(workBar).toHaveAttribute('aria-valuenow', '50');
		await expect
			.element(page.getByRole('progressbar', { name: 'Break earned' }))
			.toHaveAttribute('aria-valuenow', '0');
	});

	it("says a bar's time against its target in words, or just the time when it has no target", async () => {
		render(BlockCard, { block: focusBlock() });

		await expect
			.element(page.getByRole('progressbar', { name: 'Work' }))
			.toHaveAttribute('aria-valuetext', '12:30 of 25:00');
		await expect
			.element(page.getByRole('progressbar', { name: 'Break earned' }))
			.toHaveAttribute('aria-valuetext', '2:30');
	});
});
