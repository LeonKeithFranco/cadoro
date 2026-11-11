import { page } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

/**
 * Lets time pass, then fires the screen's next tick, as its interval would once that time is up.
 *
 * @remarks
 * Only the interval is faked, not `Date`, so the session reads the fake clock above, and the
 * test runner's own timers keep working. A screen with no interval running doesn't update.
 *
 * @param durationMs - How much time passes, in milliseconds.
 */
function elapse(durationMs: number): void {
	nowMs += durationMs;
	vi.advanceTimersToNextTimer();
}

beforeEach(() => {
	nowMs = 0;
	vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
});

afterEach(() => {
	vi.useRealTimers();
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
		await expect.element(page.getByRole('button', { name: 'Play' })).toBeEnabled();
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

describe('running a routine from the Timer screen', () => {
	it('counts the work up every second once Play is pressed, and locks the picker', async () => {
		render(TimerScreen, { session: createSession() });

		await page.getByRole('button', { name: 'Play' }).click();
		elapse(seconds(1));

		const workBox = page
			.getByRole('region', { name: 'Focus' })
			.getByRole('group', { name: 'Work' });
		await expect.element(workBox).toHaveTextContent('0:01 / 25:00');
		await expect.element(workBox).toHaveAttribute('aria-current', 'true');
		await expect.element(page.getByRole('button', { name: 'Pause' })).toBeVisible();
		await expect.element(page.getByRole('combobox', { name: 'Routine' })).toBeDisabled();
	});

	it('grows the break earned as the work goes on', async () => {
		render(TimerScreen, { session: createSession() });

		await page.getByRole('button', { name: 'Play' }).click();
		elapse(minutes(10));

		await expect
			.element(page.getByRole('group', { name: 'Break earned' }))
			.toHaveTextContent('2:00');
	});

	it('marks the work as overtime once it reaches its target, and keeps counting', async () => {
		render(TimerScreen, { session: createSession() });

		await page.getByRole('button', { name: 'Play' }).click();
		elapse(minutes(25));
		await expect
			.element(page.getByRole('group', { name: 'Work · Overtime' }))
			.toHaveTextContent('25:00 / 25:00');

		elapse(minutes(5));
		await expect
			.element(page.getByRole('group', { name: 'Work · Overtime' }))
			.toHaveTextContent('30:00 / 25:00');
	});

	it('stops counting while paused, and goes on from the same time after Play', async () => {
		render(TimerScreen, { session: createSession() });
		await page.getByRole('button', { name: 'Play' }).click();
		elapse(minutes(3));

		await page.getByRole('button', { name: 'Pause' }).click();
		await expect.element(page.getByRole('button', { name: 'Play' })).toBeVisible();
		expect(vi.getTimerCount()).toBe(0);
		nowMs += minutes(2);

		await page.getByRole('button', { name: 'Play' }).click();
		elapse(seconds(1));
		await expect
			.element(page.getByRole('group', { name: 'Work' }))
			.toHaveTextContent('3:01 / 25:00');
	});

	it('counts the break down after Next, keeping the time worked in the work box', async () => {
		render(TimerScreen, { session: createSession() });
		await page.getByRole('button', { name: 'Play' }).click();
		elapse(minutes(25));

		await page.getByRole('button', { name: 'Next' }).click();
		elapse(minutes(1));

		const card = page.getByRole('region', { name: 'Focus' });
		const breakBox = card.getByRole('group', { name: 'Break', exact: true });
		await expect.element(breakBox).toHaveTextContent('4:00');
		await expect.element(breakBox).toHaveAttribute('aria-current', 'true');
		await expect
			.element(card.getByRole('group', { name: 'Work' }))
			.toHaveTextContent('25:00 / 25:00');
		await expect.element(page.getByRole('button', { name: 'Pause' })).toBeVisible();
	});

	it('shows the break as over at 0:00, stops ticking, and waits for Play', async () => {
		render(TimerScreen, { session: createSession() });
		await page.getByRole('button', { name: 'Play' }).click();
		elapse(minutes(25));
		await page.getByRole('button', { name: 'Next' }).click();

		elapse(minutes(5));

		await expect.element(page.getByRole('group', { name: 'Break over' })).toHaveTextContent('0:00');
		await expect.element(page.getByRole('button', { name: 'Play' })).toBeVisible();
		expect(vi.getTimerCount()).toBe(0);
	});

	it('starts the next round with Play once the break is over', async () => {
		render(TimerScreen, { session: createSession() });
		await page.getByRole('button', { name: 'Play' }).click();
		elapse(minutes(25));
		await page.getByRole('button', { name: 'Next' }).click();
		elapse(minutes(5));

		await page.getByRole('button', { name: 'Play' }).click();
		elapse(seconds(1));

		await expect.element(page.getByText('Round 2', { exact: true })).toBeVisible();
		await expect
			.element(page.getByRole('group', { name: 'Work' }))
			.toHaveTextContent('0:01 / 25:00');
	});

	it("moves the active box to the next block's card once a block's cycles are done", async () => {
		render(TimerScreen, { session: createSession() });
		await page.getByRole('combobox', { name: 'Routine' }).selectOptions('Classic with long break');
		await page.getByRole('button', { name: 'Play' }).click();

		// Each Focus cycle's work, then its break.
		for (let press = 0; press < 6; press++) {
			await page.getByRole('button', { name: 'Next' }).click();
		}

		await expect.element(page.getByText('Round 1 · Block 2 of 2', { exact: true })).toBeVisible();
		await expect
			.element(
				page.getByRole('region', { name: 'Long break' }).getByRole('group', { name: 'Work' })
			)
			.toHaveAttribute('aria-current', 'true');
		await expect
			.element(page.getByRole('region', { name: 'Focus' }).getByRole('group', { name: 'Work' }))
			.not.toHaveAttribute('aria-current');
	});

	it('goes back to a ready run of the same routine after Finish', async () => {
		render(TimerScreen, { session: createSession() });
		await page.getByRole('combobox', { name: 'Routine' }).selectOptions('Classic with long break');
		await page.getByRole('button', { name: 'Play' }).click();
		elapse(minutes(7));

		await page.getByRole('button', { name: 'Finish' }).click();

		await expect.element(page.getByRole('combobox', { name: 'Routine' })).toBeEnabled();
		await expect
			.element(page.getByRole('combobox', { name: 'Routine' }))
			.toHaveDisplayValue('Classic with long break');
		await expect.element(page.getByText('Round 1 · Block 1 of 2 · Cycle 1 of 3')).toBeVisible();
		await expect
			.element(page.getByRole('region', { name: 'Focus' }).getByRole('group', { name: 'Work' }))
			.toHaveTextContent('0:00 / 25:00');
		await expect.element(page.getByRole('button', { name: 'Finish' })).toBeDisabled();
		expect(vi.getTimerCount()).toBe(0);
	});

	it('pauses the run when the screen is left, so the time away is not counted', async () => {
		const session = createSession();
		const screen = render(TimerScreen, { session });
		await page.getByRole('button', { name: 'Play' }).click();
		elapse(minutes(4));

		screen.unmount();
		nowMs += minutes(10);
		render(TimerScreen, { session });

		await expect.element(page.getByRole('button', { name: 'Play' })).toBeVisible();
		await expect
			.element(page.getByRole('group', { name: 'Work' }))
			.toHaveTextContent('4:00 / 25:00');
		expect(vi.getTimerCount()).toBe(0);
	});
});
