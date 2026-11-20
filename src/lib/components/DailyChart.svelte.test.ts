import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { DayBar } from '../stats-view';
// The app's styles, since the buttons' size and wrapping come from their classes.
import '../../routes/layout.css';
import DailyChart from './DailyChart.svelte';

/**
 * The width of a small phone's screen, in pixels, so the range buttons are checked where the card
 * is narrowest. The screen's own side margins and the card's padding make the buttons' row about
 * 70 pixels narrower still.
 */
const SMALL_PHONE_WIDTH_PX = 320;

/** The height of a phone screen, in pixels. */
const PHONE_HEIGHT_PX = 800;

/** The least height, in pixels, that a button must have for a thumb to hit it comfortably. */
const COMFORTABLE_TOUCH_HEIGHT_PX = 44;

/** The range buttons' names, in order. */
const RANGE_BUTTON_NAMES = ['7 days', '30 days', '90 days', '1 year', 'All'];

/** One day of work, so the chart has a bar to draw. */
const bars: DayBar[] = [
	{ day: '2026-11-19', label: 'Nov 19', dateLabel: 'Nov 19, 2026', minutes: 25, duration: '25:00' }
];

describe('DailyChart range buttons on a small phone', () => {
	/**
	 * Measures where a button's text sits against its content box, which is the button less its
	 * padding and border.
	 *
	 * @param button - A range button.
	 * @returns The text's width and height, the content box's width, and the button's height, all
	 * in pixels.
	 */
	function measure(button: HTMLElement): {
		textWidth: number;
		textHeight: number;
		contentWidth: number;
		buttonHeight: number;
	} {
		const textRange = document.createRange();
		textRange.selectNodeContents(button);
		const textBox = textRange.getBoundingClientRect();
		const style = getComputedStyle(button);
		const contentWidth =
			button.clientWidth -
			Number.parseFloat(style.paddingLeft) -
			Number.parseFloat(style.paddingRight);
		return {
			textWidth: textBox.width,
			textHeight: textBox.height,
			contentWidth,
			buttonHeight: button.getBoundingClientRect().height
		};
	}

	it('keeps each name on one line inside its button, which is tall enough to touch', async () => {
		await page.viewport(SMALL_PHONE_WIDTH_PX, PHONE_HEIGHT_PX);
		render(DailyChart, { bars, preset: '7d', onpreset: (): void => {} });

		for (const name of RANGE_BUTTON_NAMES) {
			const button = page.getByRole('button', { name, exact: true }).element() as HTMLElement;
			const { textWidth, textHeight, contentWidth, buttonHeight } = measure(button);
			const lineHeight = Number.parseFloat(getComputedStyle(button).lineHeight);

			expect(
				textWidth,
				`${name}: text width against the button's content width`
			).toBeLessThanOrEqual(contentWidth + 0.5);
			expect(textHeight, `${name}: text height against one line`).toBeLessThanOrEqual(
				lineHeight + 0.5
			);
			expect(buttonHeight, `${name}: button height`).toBeGreaterThanOrEqual(
				COMFORTABLE_TOUCH_HEIGHT_PX
			);
		}
	});
});
