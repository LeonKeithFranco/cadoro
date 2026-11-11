import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { BlockView, TimerBoxView } from '../block-view';
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
 * @param boxes - The boxes to show, in place of a work box at 12:30 and the break earned.
 * @returns The block's view.
 */
function focusBlock(boxes: Partial<Pick<BlockView, 'work' | 'break'>> = {}): BlockView {
	return {
		title: 'Focus',
		summary: '25 min · 20% break',
		work: workingBox,
		break: breakEarnedBox,
		...boxes
	};
}

describe('a block card', () => {
	it("is a region named after the block, with the block's target and break", async () => {
		render(BlockCard, { block: focusBlock() });

		const card = page.getByRole('region', { name: 'Focus' });
		await expect.element(card.getByRole('heading', { level: 2, name: 'Focus' })).toBeVisible();
		await expect.element(card.getByText('25 min · 20% break')).toBeVisible();
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
		await expect.element(workFill).toHaveAttribute('style', 'width: 50%;');
		await expect.element(breakFill).toHaveAttribute('style', 'width: 60%;');
	});

	it('hides the bars from screen readers, which read the times instead', async () => {
		render(BlockCard, { block: focusBlock() });

		const workFill = page.getByRole('group', { name: 'Work' }).getByTestId('progress-fill');
		await expect.element(workFill).toBeInTheDocument();
		expect(workFill.element().closest('[aria-hidden="true"]')).not.toBeNull();
	});
});
