import { page } from 'vitest/browser';
import { beforeEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { createStarterRoutines } from '../routine';
import { minutes, seconds } from '../testing/durations';
import { numberedIds } from '../testing/ids';
import { TimerSession } from '../timer.svelte';
import TimerScreen from './TimerScreen.svelte';

/** The fake clock's current moment, in milliseconds since 1970, which each test moves by hand. */
let nowMs = 0;

/**
 * Starts a session of the starter routines on the fake clock, so a test can drive the run the
 * screen shows without real time passing.
 *
 * @returns A new session, with Classic chosen and its run ready.
 */
function createSession(): TimerSession {
	return new TimerSession(createStarterRoutines(new Date(0), numberedIds()), () => nowMs);
}

beforeEach(() => {
	nowMs = 0;
});

describe('the Timer screen', () => {
	it('is headed and titled Timer', async () => {
		render(TimerScreen, { session: createSession() });

		await expect.element(page.getByRole('heading', { level: 1, name: 'Timer' })).toBeVisible();
		await expect.poll(() => document.title).toBe('Timer · Cadoro');
	});

	it("shows the first routine ready to run, with its position and its block's boxes at 0:00", async () => {
		render(TimerScreen, { session: createSession() });

		await expect
			.element(page.getByRole('combobox', { name: 'Routine' }))
			.toHaveDisplayValue('Classic');
		await expect.element(page.getByText('Round 1', { exact: true })).toBeVisible();
		const card = page.getByRole('region', { name: 'Focus' });
		await expect
			.element(card.getByRole('group', { name: 'Work' }))
			.toHaveTextContent('0:00 / 25:00');
		await expect.element(card.getByRole('group', { name: 'Break' })).toHaveTextContent('0:00');
	});

	it('shows the blocks and position of the routine the user chooses, in run order', async () => {
		render(TimerScreen, { session: createSession() });

		await page.getByRole('combobox', { name: 'Routine' }).selectOptions('Classic with long break');

		await expect.element(page.getByText('Round 1 · Block 1 of 2 · Cycle 1 of 3')).toBeVisible();
		const cards = page.getByRole('region');
		await expect.element(cards.nth(1)).toBeVisible();
		const cardNames = cards.all().map((card) => card.getByRole('heading').element().textContent);
		expect(cardNames).toEqual(['Focus', 'Long break']);
	});

	it('locks the picker once the run starts', async () => {
		const session = createSession();
		render(TimerScreen, { session });

		session.play();

		await expect.element(page.getByRole('combobox', { name: 'Routine' })).toBeDisabled();
	});

	it('follows the run as the session moves on', async () => {
		const session = createSession();
		render(TimerScreen, { session });

		session.play();
		nowMs = minutes(12) + seconds(30);
		session.tick();

		const card = page.getByRole('region', { name: 'Focus' });
		await expect
			.element(card.getByRole('group', { name: 'Work' }))
			.toHaveTextContent('12:30 / 25:00');
		await expect
			.element(card.getByRole('group', { name: 'Break earned' }))
			.toHaveTextContent('2:30');
	});
});
