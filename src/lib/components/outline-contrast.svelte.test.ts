import { page } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
// The app's styles, which hold the dark variant and Tailwind's colours.
import '../../routes/layout.css';
import type { BlockView, TimerBoxView } from '../block-view';
import { createStarterRoutines } from '../routine';
import { backdropColour, contrastRatio, MIN_OUTLINE_CONTRAST } from '../testing/contrast';
import { numberedIds } from '../testing/ids';
import BlockCard from './BlockCard.svelte';
import RoutinePicker from './RoutinePicker.svelte';
import TimerControls from './TimerControls.svelte';

/** The classes `app.html` gives the page's `<body>`, which every component sits on. */
const BODY_CLASSES = 'bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100';

/** A work box that isn't in use, so it wears its idle outline. */
const idleBox: TimerBoxView = {
	label: 'Work',
	time: '0:00',
	target: '25:00',
	isActive: false,
	isOvertime: false,
	progressPercent: 0
};

/** A block whose boxes are both idle. */
const idleBlock: BlockView = {
	title: 'Focus',
	summary: '25 min · 20% break',
	cycle: null,
	work: idleBox,
	break: { ...idleBox, label: 'Break earned', target: null }
};

/**
 * Works out the contrast of an element's outline against what it sits on.
 *
 * @param element - An element with a border.
 * @returns The contrast ratio of its top border against the first opaque background above it.
 */
function outlineContrast(element: Element): number {
	return contrastRatio(getComputedStyle(element).borderTopColor, backdropColour(element));
}

describe.each(['light', 'dark'] as const)('outlines in the %s theme', (theme) => {
	// Puts the page in the theme, with the body's colours as the app's page has them.
	beforeEach(() => {
		document.documentElement.dataset.theme = theme;
		document.body.className = BODY_CLASSES;
	});

	// Puts the page back as the other tests expect it.
	afterEach(() => {
		delete document.documentElement.dataset.theme;
		document.body.className = '';
	});

	it('keeps a card and its idle boxes at least 3:1 against what they sit on', async () => {
		render(BlockCard, { block: idleBlock });

		const card = page.getByRole('region', { name: 'Focus' }).element();
		const box = page.getByRole('group', { name: 'Work' }).element();
		expect(outlineContrast(card)).toBeGreaterThanOrEqual(MIN_OUTLINE_CONTRAST);
		expect(outlineContrast(box)).toBeGreaterThanOrEqual(MIN_OUTLINE_CONTRAST);
	});

	it('keeps a progress bar’s track at least 3:1 against the box it sits in', async () => {
		render(BlockCard, { block: idleBlock });

		const track = page.getByRole('progressbar', { name: 'Work' }).element();
		expect(outlineContrast(track)).toBeGreaterThanOrEqual(MIN_OUTLINE_CONTRAST);
	});

	it('keeps a select’s border at least 3:1 against the page', async () => {
		const routines = createStarterRoutines(new Date(0), numberedIds());
		render(RoutinePicker, {
			routines,
			selectedId: routines[0]?.id ?? '',
			disabled: false,
			onselect: vi.fn()
		});

		const select = page.getByRole('combobox', { name: 'Routine' }).element();
		expect(outlineContrast(select)).toBeGreaterThanOrEqual(MIN_OUTLINE_CONTRAST);
	});

	it('keeps an outlined button’s border at least 3:1 against the page', async () => {
		render(TimerControls, {
			isRunning: false,
			isInProgress: true,
			onplaypause: vi.fn(),
			onnext: vi.fn(),
			onfinish: vi.fn()
		});

		const next = page.getByRole('button', { name: 'Next' }).element();
		expect(outlineContrast(next)).toBeGreaterThanOrEqual(MIN_OUTLINE_CONTRAST);
	});
});
