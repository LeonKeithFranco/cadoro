import { page, userEvent } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
// The app's styles, which the layout loads, since the pinned controls and the scrolling need them.
import '../../routes/layout.css';
import { requireDefined } from '../defined';
import { createStarterRoutines, type Routine } from '../routine';
import type { InMemoryStorage } from '../storage/in-memory-storage';
import { minutes, seconds } from '../testing/durations';
import { numberedIds } from '../testing/ids';
import { oneRoundRoutine } from '../testing/routines';
import { shownTotals } from '../testing/run-summary';
import { storageHolding } from '../testing/storage';
import { TimerSession } from '../timer.svelte';
import TimerScreen from './TimerScreen.svelte';

/** The starter routines with predictable ids, which a session picks from unless a test says. */
const STARTER_ROUTINES = createStarterRoutines(new Date(0), numberedIds());

/** The fake clock's current moment, in milliseconds since 1970, which each test moves by hand. */
let nowMs = 0;

/**
 * Makes the revisions of every session in a test, so two sessions on one storage, as two tabs,
 * never make the same one.
 */
let newRevision = numberedIds('revision');

/**
 * Starts a session on the fake clock, so a test can drive the run the screen shows without real
 * time passing. Its `onWorkSaved` is a spy nothing checks.
 *
 * @param routines - The routines to pick from. The starter routines unless a test needs others.
 * @param storage - Where the session saves. New, empty storage unless a test reads what's saved,
 * or shares it with another session, as another tab.
 * @param newId - Makes the ids of its runs and work periods. Two tabs each have their own.
 * @returns A new session, with the first routine chosen and its run ready.
 */
function createSession(
	routines: readonly Routine[] = STARTER_ROUTINES,
	storage: InMemoryStorage = storageHolding(routines),
	newId: () => string = numberedIds()
): TimerSession {
	return new TimerSession(routines, {
		clock: () => nowMs,
		storage,
		newId,
		newRevision,
		onWorkSaved: vi.fn()
	});
}

/**
 * Makes the page report that it's hidden or visible, then tells the screen, as the browser does
 * when the user switches tabs or apps.
 *
 * @remarks
 * A test can't hide its own page, so `document.visibilityState` is replaced until the test ends.
 *
 * @param state - What the page now reports.
 */
function changeVisibility(state: DocumentVisibilityState): void {
	vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(state);
	document.dispatchEvent(new Event('visibilitychange'));
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

/**
 * Presses Finish, then confirms it in the dialog that asks, as a user ending a run does.
 *
 * @remarks
 * The confirmation's own Finish button is found inside the dialog, since the screen's Finish
 * button behind it has the same name.
 */
async function finishRun(): Promise<void> {
	await page.getByRole('button', { name: 'Finish' }).click();
	await page
		.getByRole('dialog', { name: 'Finish this run?' })
		.getByRole('button', { name: 'Finish' })
		.click();
}

// Starts each test at the fake clock's 0, with revisions numbered afresh and the screen's interval
// faked so a test fires it.
beforeEach(() => {
	nowMs = 0;
	newRevision = numberedIds('revision');
	vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
});

// Puts back the real timers and whatever a test replaced, such as the page's visibility.
afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
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

	it("shows the same cycle on the block's card as in the position, before and during the run", async () => {
		render(TimerScreen, { session: createSession() });
		await page.getByRole('combobox', { name: 'Routine' }).selectOptions('Classic with long break');
		const focusCard = page.getByRole('region', { name: 'Focus' });

		await expect.element(page.getByText('Round 1 · Block 1 of 2 · Cycle 1 of 3')).toBeVisible();
		await expect.element(focusCard.getByText('Cycle 1 / 3')).toBeVisible();

		await page.getByRole('button', { name: 'Play' }).click();
		await page.getByRole('button', { name: 'Next' }).click();
		await page.getByRole('button', { name: 'Next' }).click();

		await expect.element(page.getByText('Round 1 · Block 1 of 2 · Cycle 2 of 3')).toBeVisible();
		await expect.element(focusCard.getByText('Cycle 2 / 3')).toBeVisible();
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

	it('banks the break time left when Next skips the rest of a break, and adds it to the next break', async () => {
		render(TimerScreen, { session: createSession() });
		const card = page.getByRole('region', { name: 'Focus' });
		const breakBox = card.getByRole('group', { name: /^Break/ });
		await page.getByRole('button', { name: 'Play' }).click();
		// 20% of 10 minutes is 2:00 of break.
		elapse(minutes(10));
		await page.getByRole('button', { name: 'Next' }).click();

		elapse(seconds(30));
		await page.getByRole('button', { name: 'Next' }).click();

		// The 1:30 left of the break is banked, and shows at once in the new work period.
		await expect.element(breakBox).toHaveAccessibleName('Break earned');
		await expect.element(breakBox).toHaveTextContent('1:30');

		elapse(minutes(10));
		await expect.element(breakBox).toHaveTextContent('3:30');

		await page.getByRole('button', { name: 'Next' }).click();
		await expect.element(breakBox).toHaveAccessibleName('Break');
		await expect.element(breakBox).toHaveTextContent('3:30');
		elapse(seconds(30));
		await expect.element(breakBox).toHaveTextContent('3:00');
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

	it('asks before Finish ends the run, and keeps counting while it asks', async () => {
		render(TimerScreen, { session: createSession() });
		await page.getByRole('button', { name: 'Play' }).click();
		elapse(minutes(4));

		await page.getByRole('button', { name: 'Finish' }).click();
		elapse(minutes(1));

		await expect.element(page.getByRole('dialog', { name: 'Finish this run?' })).toBeVisible();
		await expect.element(page.getByRole('dialog', { name: 'Run summary' })).not.toBeInTheDocument();
		await expect
			.element(page.getByRole('group', { name: 'Work' }))
			.toHaveTextContent('5:00 / 25:00');
	});

	it('keeps the run going, as if Finish had not been pressed, when the user cancels', async () => {
		render(TimerScreen, { session: createSession() });
		await page.getByRole('button', { name: 'Play' }).click();
		elapse(minutes(4));
		await page.getByRole('button', { name: 'Finish' }).click();

		await page.getByRole('button', { name: 'Cancel' }).click();
		elapse(minutes(1));

		await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: 'Pause' })).toBeVisible();
		await expect
			.element(page.getByRole('group', { name: 'Work' }))
			.toHaveTextContent('5:00 / 25:00');
	});

	it('keeps the run going when the user presses Escape at the question', async () => {
		render(TimerScreen, { session: createSession() });
		await page.getByRole('button', { name: 'Play' }).click();
		elapse(minutes(4));
		await page.getByRole('button', { name: 'Finish' }).click();
		await expect.element(page.getByRole('dialog', { name: 'Finish this run?' })).toBeVisible();

		await userEvent.keyboard('{Escape}');

		await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: 'Pause' })).toBeVisible();
	});

	it('ends the run when Finish is confirmed, counting the time spent deciding, and shows its summary', async () => {
		render(TimerScreen, { session: createSession() });
		await page.getByRole('combobox', { name: 'Routine' }).selectOptions('Classic with long break');
		await page.getByRole('button', { name: 'Play' }).click();
		elapse(minutes(7));
		await page.getByRole('button', { name: 'Finish' }).click();
		elapse(minutes(1));

		await page
			.getByRole('dialog', { name: 'Finish this run?' })
			.getByRole('button', { name: 'Finish' })
			.click();

		await expect
			.element(page.getByRole('dialog', { name: 'Finish this run?' }))
			.not.toBeInTheDocument();
		const summary = page.getByRole('dialog', { name: 'Run summary' });
		await expect.element(summary).toBeVisible();
		await expect.element(summary.getByText('Classic with long break')).toBeVisible();
		expect(shownTotals(summary)).toEqual([
			['Total work time', '8:00'],
			['Work periods completed', '1'],
			['Rounds reached', '1'],
			['Total overtime', '0:00']
		]);
		expect(vi.getTimerCount()).toBe(0);
	});

	it("shows the run summary once a finite routine's last work period ends", async () => {
		const session = createSession([oneRoundRoutine]);
		render(TimerScreen, { session });
		await page.getByRole('button', { name: 'Play' }).click();
		elapse(minutes(26));

		await page.getByRole('button', { name: 'Next' }).click();

		const summary = page.getByRole('dialog', { name: 'Run summary' });
		await expect.element(summary).toBeVisible();
		expect(shownTotals(summary)).toEqual([
			['Total work time', '26:00'],
			['Work periods completed', '1'],
			['Rounds reached', '1'],
			['Total overtime', '1:00']
		]);
	});

	it('still shows the run summary after leaving the screen and coming back', async () => {
		const session = createSession();
		const screen = render(TimerScreen, { session });
		await page.getByRole('button', { name: 'Play' }).click();
		elapse(minutes(3));
		await finishRun();
		await expect.element(page.getByRole('dialog', { name: 'Run summary' })).toBeVisible();

		screen.unmount();
		render(TimerScreen, { session });

		await expect.element(page.getByRole('dialog', { name: 'Run summary' })).toBeVisible();
	});

	it('readies a new run of the same routine once the summary is closed with Done', async () => {
		render(TimerScreen, { session: createSession() });
		await page.getByRole('combobox', { name: 'Routine' }).selectOptions('Classic with long break');
		await page.getByRole('button', { name: 'Play' }).click();
		elapse(minutes(7));
		await finishRun();

		await page.getByRole('button', { name: 'Done' }).click();

		await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
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

	it('puts the keyboard focus on Play once the summary is closed with Done', async () => {
		render(TimerScreen, { session: createSession() });
		await page.getByRole('button', { name: 'Play' }).click();
		elapse(minutes(7));
		await finishRun();

		await page.getByRole('button', { name: 'Done' }).click();

		await expect.element(page.getByRole('button', { name: 'Play' })).toHaveFocus();
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

	it('pauses on leaving without counting it as a button press, so the chimes stay locked', async () => {
		const onPress = vi.fn();
		const session = new TimerSession(STARTER_ROUTINES, {
			clock: (): number => nowMs,
			storage: storageHolding(STARTER_ROUTINES),
			newId: numberedIds(),
			newRevision,
			onWorkSaved: vi.fn(),
			onPress
		});
		const screen = render(TimerScreen, { session });
		await page.getByRole('button', { name: 'Play' }).click();
		expect(onPress).toHaveBeenCalledOnce();

		screen.unmount();

		expect(session.view).toMatchObject({ isRunning: false, isInProgress: true });
		expect(onPress).toHaveBeenCalledOnce();
	});
});

describe('the Timer screen’s live region', () => {
	it('is a polite status region, empty until something is worth announcing', async () => {
		render(TimerScreen, { session: createSession() });

		const status = page.getByRole('status');
		await expect.element(status).toHaveAttribute('aria-live', 'polite');
		expect(status.element().textContent).toBe('');
		await page.getByRole('button', { name: 'Play' }).click();
		elapse(minutes(3));
		await expect.element(page.getByRole('group', { name: 'Work' })).toHaveTextContent('3:00');
		expect(status.element().textContent).toBe('');
	});

	it('announces overtime, the break starting, the break being over and the run ending', async () => {
		render(TimerScreen, { session: createSession() });
		const status = page.getByRole('status');
		await page.getByRole('button', { name: 'Play' }).click();

		elapse(minutes(25));
		await expect.element(status).toHaveTextContent('Overtime');

		await page.getByRole('button', { name: 'Next' }).click();
		await expect.element(status).toHaveTextContent('Break started');

		elapse(minutes(5));
		await expect.element(status).toHaveTextContent('Break over');

		await page.getByRole('button', { name: 'Play' }).click();
		await finishRun();
		await expect.element(status).toHaveTextContent('Run ended');
	});
});

describe('saving the run as the page goes away', () => {
	it('saves a heartbeat as the page is hidden, so a restored run counts the work until then', async () => {
		const storage = storageHolding(STARTER_ROUTINES);
		render(TimerScreen, { session: createSession(undefined, storage) });
		await page.getByRole('button', { name: 'Play' }).click();
		nowMs = seconds(30);

		changeVisibility('hidden');

		await expect
			.poll(() => storage.getRunInProgress())
			.toMatchObject({ heartbeatAt: '1970-01-01T00:00:30.000Z' });
	});

	it('saves a heartbeat as the page is closed or reloaded', async () => {
		const storage = storageHolding(STARTER_ROUTINES);
		render(TimerScreen, { session: createSession(undefined, storage) });
		await page.getByRole('button', { name: 'Play' }).click();
		nowMs = seconds(30);

		window.dispatchEvent(new PageTransitionEvent('pagehide'));

		await expect
			.poll(() => storage.getRunInProgress())
			.toMatchObject({ heartbeatAt: '1970-01-01T00:00:30.000Z' });
	});

	it('saves nothing as the page becomes visible again', async () => {
		const storage = storageHolding(STARTER_ROUTINES);
		const saveSpy = vi.spyOn(storage, 'saveRunInProgress');
		const heartbeatSpy = vi.spyOn(storage, 'saveHeartbeat');
		render(TimerScreen, { session: createSession(undefined, storage) });
		await page.getByRole('button', { name: 'Play' }).click();
		nowMs = seconds(30);
		changeVisibility('visible');
		nowMs = seconds(40);

		changeVisibility('hidden');

		// Saves reach storage in order, so once the hidden page's heartbeat is saved, any earlier
		// one would be too.
		await expect
			.poll(() => storage.getRunInProgress())
			.toMatchObject({ heartbeatAt: '1970-01-01T00:00:40.000Z' });
		expect(saveSpy).toHaveBeenCalledOnce();
		expect(heartbeatSpy).toHaveBeenCalledOnce();
	});
});

describe('following the run from another tab', () => {
	it('shows a press made in another tab, and counts on from it', async () => {
		const storage = storageHolding(STARTER_ROUTINES);
		const session = createSession(undefined, storage);
		const otherTab = createSession(undefined, storage, numberedIds('other'));
		render(TimerScreen, { session });

		otherTab.play();

		await expect.element(page.getByRole('button', { name: 'Pause' })).toBeVisible();
		await expect.element(page.getByRole('combobox', { name: 'Routine' })).toBeDisabled();
		elapse(minutes(1));
		await expect
			.element(page.getByRole('group', { name: 'Work' }))
			.toHaveTextContent('1:00 / 25:00');
	});

	it('drops the Finish question when another tab ends the run, showing its summary', async () => {
		const storage = storageHolding(STARTER_ROUTINES);
		const session = createSession(undefined, storage);
		const otherTab = createSession(undefined, storage, numberedIds('other'));
		render(TimerScreen, { session });
		await page.getByRole('button', { name: 'Play' }).click();
		await expect.poll(() => otherTab.view).toMatchObject({ status: 'working' });
		await page.getByRole('button', { name: 'Finish' }).click();
		await expect.element(page.getByRole('dialog', { name: 'Finish this run?' })).toBeVisible();

		otherTab.finish();

		await expect.element(page.getByRole('dialog', { name: 'Run summary' })).toBeVisible();
		await expect
			.element(page.getByRole('dialog', { name: 'Finish this run?' }))
			.not.toBeInTheDocument();
	});

	it('doesn’t ask about Finish again in the next run after another tab ended the last one', async () => {
		const storage = storageHolding(STARTER_ROUTINES);
		const session = createSession(undefined, storage);
		const otherTab = createSession(undefined, storage, numberedIds('other'));
		render(TimerScreen, { session });
		await page.getByRole('button', { name: 'Play' }).click();
		await expect.poll(() => otherTab.view).toMatchObject({ status: 'working' });
		await page.getByRole('button', { name: 'Finish' }).click();
		otherTab.finish();
		await page.getByRole('button', { name: 'Done' }).click();

		await page.getByRole('button', { name: 'Play' }).click();

		await expect.element(page.getByRole('button', { name: 'Pause' })).toBeVisible();
		await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
	});
});

/**
 * Makes a routine of many one-cycle blocks, so the screen is much taller than the window.
 *
 * @param count - How many blocks.
 * @returns A routine that repeats forever, whose blocks are titled `Block 1`, `Block 2` and so on.
 */
function routineOfBlocks(count: number): Routine {
	return {
		...oneRoundRoutine,
		id: 'long',
		title: 'Long',
		rounds: 'infinite',
		blocks: Array.from({ length: count }, (_, index) => ({
			id: `long-${index + 1}`,
			title: `Block ${index + 1}`,
			targetMinutes: 25,
			breakPercent: 20,
			cycles: 1
		}))
	};
}

/**
 * Finds the pinned container the run's buttons sit in.
 *
 * @returns The container, which is the closest `sticky` ancestor of the Finish button.
 */
function pinnedControls(): Element {
	const finish = page.getByRole('button', { name: 'Finish' }).element();
	return requireDefined(finish.closest('.sticky') ?? undefined, 'the pinned controls');
}

describe('a long routine on the Timer screen', () => {
	it('keeps the controls pinned in the window, however far down the page is', async () => {
		render(TimerScreen, { session: createSession([routineOfBlocks(12)]) });
		window.scrollTo(0, 0);

		expect(getComputedStyle(pinnedControls()).position).toBe('sticky');
		const controls = pinnedControls().getBoundingClientRect();
		expect(controls.bottom).toBeLessThanOrEqual(window.innerHeight);
		expect(controls.top).toBeGreaterThan(0);
		expect(document.documentElement.scrollHeight).toBeGreaterThan(window.innerHeight * 2);
	});

	it('scrolls the active block into view when the run moves to a block out of view', async () => {
		render(TimerScreen, { session: createSession([routineOfBlocks(12)]) });
		await page.getByRole('button', { name: 'Play' }).click();
		window.scrollTo(0, 0);

		// Each block's work, then its break, with two presses.
		for (let press = 0; press < 16; press++) {
			await page.getByRole('button', { name: 'Next' }).click();
		}

		await expect.element(page.getByText('Round 1 · Block 9 of 12', { exact: true })).toBeVisible();
		await expect
			.poll(() => {
				const card = page
					.getByRole('region', { name: 'Block 9' })
					.element()
					.getBoundingClientRect();
				const controls = pinnedControls().getBoundingClientRect();
				return card.top >= 0 && card.bottom <= controls.top + 1;
			})
			.toBe(true);
	});

	it('doesn’t scroll while every block fits, however the run moves', async () => {
		const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView');
		render(TimerScreen, { session: createSession([routineOfBlocks(2)]) });
		window.scrollTo(0, 0);
		await page.getByRole('button', { name: 'Play' }).click();

		for (let press = 0; press < 3; press++) {
			await page.getByRole('button', { name: 'Next' }).click();
		}

		// `nearest` moves the page only when the block is out of view, as it never is here.
		expect(scrollIntoView).toHaveBeenCalled();
		for (const [options] of scrollIntoView.mock.calls) {
			expect(options).toEqual({ block: 'nearest' });
		}
		expect(window.scrollY).toBe(0);
	});
});

describe('the routine picker on the Timer screen', () => {
	it('lists the routines in the order the Routines screen’s sort gives', async () => {
		render(TimerScreen, { session: createSession(), routineSort: 'title-desc' });

		const options = page.getByRole('combobox', { name: 'Routine' }).getByRole('option');

		expect(options.elements().map((option) => option.textContent)).toEqual([
			'Classic with long break',
			'Classic'
		]);
	});

	it('lists them in custom order when no sort is given', async () => {
		render(TimerScreen, { session: createSession() });

		const options = page.getByRole('combobox', { name: 'Routine' }).getByRole('option');

		expect(options.elements().map((option) => option.textContent)).toEqual([
			'Classic',
			'Classic with long break'
		]);
	});
});
