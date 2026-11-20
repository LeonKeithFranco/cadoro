import { beforeNavigate, goto, type BeforeNavigate } from '$app/navigation';
import { page, userEvent, type Locator } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { requireDefined } from '../defined';
import { useErrorLog } from '../error-log';
import type { Block, Routine } from '../routine';
import { settingsFrom, type Settings } from '../settings';
import { SettingsSession } from '../settings.svelte';
import { InMemoryStorage } from '../storage/in-memory-storage';
import type { CadoroStorage } from '../storage/storage';
import { numberedIds } from '../testing/ids';
import { routineWith } from '../testing/routines';
import { runInProgressWith } from '../testing/run-in-progress';
import { runWith } from '../testing/run-records';
import type { Run } from '../run-records';
import RoutinesScreen from './RoutinesScreen.svelte';

// Outside the running app there is no router, so navigation is replaced with spies, and the
// callback the screen gives `beforeNavigate` is kept for the tests to call as the router would.
vi.mock('$app/navigation', () => ({ beforeNavigate: vi.fn(), goto: vi.fn() }));

/** The moment the screen and storage believe it is. */
const NOW = '2026-11-19T10:00:00.000Z';

/**
 * Makes a block for a test.
 *
 * @param id - The block's id, which a test can tell it by.
 * @param title - The block's title.
 * @param cycles - The block's cycles.
 * @returns The block, with a 25-minute target and a 20% break.
 */
function blockWith(id: string, title: string, cycles = 1): Block {
	return { id, title, targetMinutes: 25, breakPercent: 20, cycles };
}

/**
 * Makes the routines most tests start with.
 *
 * @returns Alpha with two blocks, then Bravo and Charlie with one each, in that custom order.
 */
function threeRoutines(): Routine[] {
	return [
		routineWith({
			id: 'alpha',
			title: 'Alpha',
			rounds: 2,
			blocks: [blockWith('alpha-1', 'Write', 2), blockWith('alpha-2', 'Review')],
			customPosition: 0,
			createdAt: '2026-01-02T00:00:00.000Z'
		}),
		routineWith({
			id: 'bravo',
			title: 'Bravo',
			rounds: 'infinite',
			blocks: [blockWith('bravo-1', 'Focus')],
			customPosition: 1,
			createdAt: '2026-01-03T00:00:00.000Z'
		}),
		routineWith({
			id: 'charlie',
			title: 'Charlie',
			rounds: 1,
			blocks: [blockWith('charlie-1', 'Focus')],
			customPosition: 2,
			createdAt: '2026-01-01T00:00:00.000Z'
		})
	];
}

/** What a test gets from {@link openScreen}. */
type OpenScreen = {
	/** The storage the screen edits, which a test reads back and changes as another tab would. */
	storage: InMemoryStorage;
	/** The settings the screen remembers its sort in. */
	settingsSession: SettingsSession;
	/** Changes the screen's props after it opened, as a run starting in another tab does. */
	rerender: (props: { runningRoutineId: string | null }) => Promise<void>;
};

/**
 * Opens the Routines screen on storage that holds some routines.
 *
 * @param routines - The routines saved. Alpha, Bravo and Charlie unless a test needs others.
 * @param settings - The settings the user has changed, such as the saved sort.
 * @param runs - The runs saved before the screen opens, which "last used" is worked out from.
 * @param runningRoutineId - The id of the routine a run in progress is running, if any.
 * @returns The storage and settings behind the screen.
 */
async function openScreen(
	routines: Routine[] = threeRoutines(),
	settings: Partial<Settings> = {},
	runs: Run[] = [],
	runningRoutineId: string | null = null
): Promise<OpenScreen> {
	const storage = new InMemoryStorage({ now: (): Date => new Date(NOW) });
	await storage.addRoutinesIfNone(routines);
	// Saved before the session starts following the settings, which report what storage holds.
	await storage.saveSettings(settings);
	for (const run of runs) {
		await storage.saveRunInProgress(runInProgressWith({}), null, { run, workPeriods: [] });
	}
	const settingsSession = new SettingsSession(storage, settingsFrom(settings));
	const screen = await render(RoutinesScreen, {
		storage,
		settingsSession,
		initialRoutines: routines,
		runningRoutineId,
		newId: numberedIds('new'),
		now: () => new Date(NOW)
	});
	return {
		storage,
		settingsSession,
		rerender: (props) => screen.rerender(props)
	};
}

/**
 * Finds a routine's card in the list.
 *
 * @param title - The routine's title, in full.
 * @returns The list item holding the routine.
 */
function cardOf(title: string): Locator {
	return page.getByRole('listitem', { name: title, exact: true });
}

/**
 * Reads the titles of the routines in the list, top to bottom.
 *
 * @returns The titles, from each card's heading.
 */
function listedTitles(): string[] {
	return page
		.getByRole('list', { name: 'Routines' })
		.getByRole('heading', { level: 2 })
		.elements()
		.map((heading) => heading.textContent);
}

/**
 * Finds a block's group in the open form.
 *
 * @param position - The block's place in the form, counting from 1.
 * @returns The block's group.
 */
function blockGroup(position: number): Locator {
	return page.getByRole('group', { name: `Block ${position}`, exact: true });
}

/**
 * Presses Edit on a routine, opening its form.
 *
 * @param title - The routine's title.
 */
async function openForEditing(title: string): Promise<void> {
	await cardOf(title).getByRole('button', { name: 'Edit' }).click();
	await expect.element(page.getByRole('form', { name: 'Edit routine' })).toBeVisible();
}

/**
 * Gives the open form's routine a new title.
 *
 * @param title - What to type in the Title field.
 */
async function typeTitle(title: string): Promise<void> {
	await page.getByRole('textbox', { name: 'Title', exact: true }).fill(title);
}

/**
 * Presses Tab through the page from its start, noting what each press lands on.
 *
 * @param presses - How many times to press Tab.
 * @returns What each focused element is called, by its label, or by its text when it has none,
 * in the order Tab reached them.
 */
async function tabStops(presses: number): Promise<string[]> {
	(document.activeElement as HTMLElement | null)?.blur();
	const stops: string[] = [];
	for (let press = 0; press < presses; press += 1) {
		await userEvent.tab();
		const focused = document.activeElement;
		stops.push(focused?.getAttribute('aria-label') ?? focused?.textContent?.trim() ?? '');
	}
	return stops;
}

beforeEach(() => {
	vi.mocked(beforeNavigate).mockClear();
	vi.mocked(goto).mockClear();
});

describe('the Routines screen', () => {
	it('lists each routine with its rounds and blocks, in custom order', async () => {
		await openScreen();

		await expect.element(page.getByRole('heading', { level: 1, name: 'Routines' })).toBeVisible();
		expect(listedTitles()).toEqual(['Alpha', 'Bravo', 'Charlie']);
		await expect.element(cardOf('Alpha').getByText('2 rounds · 2 blocks')).toBeVisible();
		await expect.element(cardOf('Bravo').getByText('Repeats forever · 1 block')).toBeVisible();
		await expect.element(cardOf('Charlie').getByText('1 round · 1 block')).toBeVisible();
	});

	it('follows a routine another tab creates', async () => {
		const { storage } = await openScreen();

		await storage.createRoutine(routineWith({ id: 'delta', title: 'Delta', customPosition: 3 }));

		await expect.poll(listedTitles).toEqual(['Alpha', 'Bravo', 'Charlie', 'Delta']);
	});
});

describe('sorting', () => {
	it('offers the seven orders, starting with custom order', async () => {
		await openScreen();

		const options = page.getByRole('combobox', { name: 'Sort by' }).getByRole('option');

		expect(options.elements().map((option) => option.textContent)).toEqual([
			'Custom order',
			'Title (A–Z)',
			'Title (Z–A)',
			'Last used',
			'Most work time',
			'Newest',
			'Oldest'
		]);
	});

	it('shows the sort the settings remember', async () => {
		await openScreen(threeRoutines(), { routineSort: 'title-desc' });

		expect(listedTitles()).toEqual(['Charlie', 'Bravo', 'Alpha']);
		await expect
			.element(page.getByRole('combobox', { name: 'Sort by' }))
			.toHaveDisplayValue('Title (Z–A)');
	});

	it('re-sorts the list and remembers the choice in the settings', async () => {
		const { settingsSession } = await openScreen();

		await page.getByRole('combobox', { name: 'Sort by' }).selectOptions('Newest');

		expect(listedTitles()).toEqual(['Bravo', 'Alpha', 'Charlie']);
		expect(settingsSession.settings.routineSort).toBe('newest');
	});

	it('sorts by last used from the saved runs', async () => {
		await openScreen(threeRoutines(), {}, [
			runWith({ id: 'run-1', routineId: 'charlie', startedAt: '2026-11-18T09:00:00.000Z' })
		]);

		await page.getByRole('combobox', { name: 'Sort by' }).selectOptions('Last used');

		await expect.poll(listedTitles).toEqual(['Charlie', 'Alpha', 'Bravo']);
	});

	it('has drag handles, Move up and Move down only in custom order', async () => {
		await openScreen();
		await expect.element(page.getByRole('button', { name: 'Drag Alpha' })).toBeVisible();
		await expect.element(cardOf('Alpha').getByRole('button', { name: 'Move up' })).toBeVisible();

		await page.getByRole('combobox', { name: 'Sort by' }).selectOptions('Oldest');

		await expect.element(page.getByRole('button', { name: 'Drag Alpha' })).not.toBeInTheDocument();
		await expect
			.element(cardOf('Alpha').getByRole('button', { name: 'Move up' }))
			.not.toBeInTheDocument();
		await expect
			.element(cardOf('Alpha').getByRole('button', { name: 'Move down' }))
			.not.toBeInTheDocument();
	});
});

describe('moving routines', () => {
	it('moves a routine up and saves the order', async () => {
		const { storage } = await openScreen();

		await cardOf('Bravo').getByRole('button', { name: 'Move up' }).click();

		expect(listedTitles()).toEqual(['Bravo', 'Alpha', 'Charlie']);
		await expect
			.poll(async () => (await storage.getRoutines()).map((routine) => routine.id))
			.toEqual(['bravo', 'alpha', 'charlie']);
	});

	it('moves a routine down and saves the order', async () => {
		const { storage } = await openScreen();

		await cardOf('Bravo').getByRole('button', { name: 'Move down' }).click();

		expect(listedTitles()).toEqual(['Alpha', 'Charlie', 'Bravo']);
		await expect
			.poll(async () => (await storage.getRoutines()).map((routine) => routine.id))
			.toEqual(['alpha', 'charlie', 'bravo']);
	});

	it('can’t move the first routine up or the last routine down', async () => {
		await openScreen();

		await expect.element(cardOf('Alpha').getByRole('button', { name: 'Move up' })).toBeDisabled();
		await expect
			.element(cardOf('Charlie').getByRole('button', { name: 'Move down' }))
			.toBeDisabled();
		await expect.element(cardOf('Bravo').getByRole('button', { name: 'Move up' })).toBeEnabled();
	});

	it('keeps the drag handles, the list and its items out of the Tab order, since the buttons move by keyboard', async () => {
		await openScreen();

		const stops = await tabStops(24);

		expect(stops).toContain('Move down');
		expect(stops.filter((stop) => stop.startsWith('Drag'))).toEqual([]);
		expect(
			stops.filter((stop) => ['Routines', 'Alpha', 'Bravo', 'Charlie'].includes(stop))
		).toEqual([]);
	});
});

describe('a new routine', () => {
	it('opens at the top with a blank title, infinite rounds and one default block, and Save is off', async () => {
		await openScreen();

		await page.getByRole('button', { name: 'New routine' }).click();

		const form = page.getByRole('form', { name: 'Edit routine' });
		await expect.element(form.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue('');
		await expect.element(form.getByRole('checkbox', { name: 'Repeat forever' })).toBeChecked();
		await expect
			.element(blockGroup(1).getByRole('textbox', { name: 'Block title' }))
			.toHaveValue('Focus');
		await expect
			.element(blockGroup(1).getByRole('spinbutton', { name: 'Target (minutes)' }))
			.toHaveValue(25);
		await expect.element(form.getByRole('button', { name: 'Save' })).toBeDisabled();
		await expect.element(form.getByText('Enter a title.')).toBeVisible();
	});

	it('is saved at the top of the list once it has a title', async () => {
		const { storage } = await openScreen();
		await page.getByRole('button', { name: 'New routine' }).click();

		await typeTitle('  Deep work  ');
		await page.getByRole('button', { name: 'Save' }).click();

		await expect.poll(listedTitles).toEqual(['Deep work', 'Alpha', 'Bravo', 'Charlie']);
		await expect.element(page.getByRole('form', { name: 'Edit routine' })).not.toBeInTheDocument();
		const created = requireDefined((await storage.getRoutines())[0], 'the new routine');
		expect(created.title).toBe('Deep work');
		expect(created.rounds).toBe('infinite');
		expect(created.createdAt).toBe(NOW);
	});

	it('is removed by Cancel, and nothing is saved', async () => {
		const { storage } = await openScreen();
		await page.getByRole('button', { name: 'New routine' }).click();
		await typeTitle('Never saved');

		await page.getByRole('button', { name: 'Cancel' }).click();

		await expect.element(page.getByRole('form', { name: 'Edit routine' })).not.toBeInTheDocument();
		expect(listedTitles()).toEqual(['Alpha', 'Bravo', 'Charlie']);
		expect(await storage.getRoutines()).toHaveLength(3);
	});
});

describe('editing a routine', () => {
	it('opens the form in place, in the routine’s own place in the list', async () => {
		await openScreen();

		await openForEditing('Bravo');

		const items = page.getByRole('listitem', { name: 'Bravo', exact: true });
		await expect.element(items.getByRole('form', { name: 'Edit routine' })).toBeVisible();
		await expect.element(cardOf('Alpha').getByRole('button', { name: 'Edit' })).toBeVisible();
	});

	it('shows the routine’s title, rounds and blocks in the form', async () => {
		await openScreen();

		await openForEditing('Alpha');

		await expect
			.element(page.getByRole('textbox', { name: 'Title', exact: true }))
			.toHaveValue('Alpha');
		await expect.element(page.getByRole('spinbutton', { name: 'Rounds' })).toHaveValue(2);
		await expect
			.element(blockGroup(1).getByRole('textbox', { name: 'Block title' }))
			.toHaveValue('Write');
		await expect.element(blockGroup(1).getByRole('spinbutton', { name: 'Cycles' })).toHaveValue(2);
		await expect
			.element(blockGroup(2).getByRole('textbox', { name: 'Block title' }))
			.toHaveValue('Review');
	});

	it('saves the changes only on Save', async () => {
		const { storage } = await openScreen();
		await openForEditing('Alpha');

		await typeTitle('Renamed');
		await page.getByRole('spinbutton', { name: 'Rounds' }).fill('5');
		await blockGroup(1).getByRole('spinbutton', { name: 'Target (minutes)' }).fill('50');
		expect((await storage.getRoutines())[0]?.title).toBe('Alpha');
		await page.getByRole('button', { name: 'Save' }).click();

		await expect.poll(listedTitles).toEqual(['Renamed', 'Bravo', 'Charlie']);
		const saved = requireDefined((await storage.getRoutines())[0], 'the edited routine');
		expect(saved.rounds).toBe(5);
		expect(saved.blocks[0]?.targetMinutes).toBe(50);
		await expect.element(cardOf('Renamed').getByText('5 rounds · 2 blocks')).toBeVisible();
	});

	it('turns infinite rounds on and off with Repeat forever', async () => {
		const { storage } = await openScreen();
		await openForEditing('Alpha');

		await page.getByRole('checkbox', { name: 'Repeat forever' }).click();
		await expect.element(page.getByRole('spinbutton', { name: 'Rounds' })).toBeDisabled();
		await page.getByRole('button', { name: 'Save' }).click();

		await expect.poll(async () => (await storage.getRoutines())[0]?.rounds).toBe('infinite');
	});

	it('undoes every change with Cancel', async () => {
		const { storage } = await openScreen();
		await openForEditing('Alpha');
		await typeTitle('Renamed');

		await page.getByRole('button', { name: 'Cancel' }).click();

		expect(listedTitles()).toEqual(['Alpha', 'Bravo', 'Charlie']);
		expect((await storage.getRoutines())[0]?.title).toBe('Alpha');
		await openForEditing('Alpha');
		await expect
			.element(page.getByRole('textbox', { name: 'Title', exact: true }))
			.toHaveValue('Alpha');
	});

	it('writes an edit to the activity log with the old and new values', async () => {
		const { storage } = await openScreen();
		await openForEditing('Alpha');
		await typeTitle('Renamed');

		await page.getByRole('button', { name: 'Save' }).click();

		await expect
			.poll(async () => (await storage.getLogEntries())[0]?.message)
			.toBe('Edited routine "Renamed"');
	});
});

describe('a change that is only spaces', () => {
	it('isn’t unsaved changes, so opening another routine doesn’t ask', async () => {
		await openScreen();
		await openForEditing('Alpha');
		await typeTitle('Alpha ');

		await cardOf('Bravo').getByRole('button', { name: 'Edit' }).click();

		await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
		await expect
			.element(page.getByRole('textbox', { name: 'Title', exact: true }))
			.toHaveValue('Bravo');
	});

	it('is closed by Save without writing or logging anything', async () => {
		const { storage } = await openScreen();
		const saveRoutine = vi.spyOn(storage, 'saveRoutine');
		await openForEditing('Alpha');
		await typeTitle('  Alpha  ');

		await page.getByRole('button', { name: 'Save' }).click();

		await expect.element(page.getByRole('form', { name: 'Edit routine' })).not.toBeInTheDocument();
		expect(saveRoutine).not.toHaveBeenCalled();
		expect(await storage.getLogEntries()).toEqual([]);
	});

	it('is still saved, trimmed, along with a real change', async () => {
		const { storage } = await openScreen();
		await openForEditing('Alpha');
		await typeTitle('  Renamed  ');

		await page.getByRole('button', { name: 'Save' }).click();

		await expect.poll(async () => (await storage.getRoutines())[0]?.title).toBe('Renamed');
	});
});

describe('validation', () => {
	it('shows what is wrong beside each field and turns Save off', async () => {
		await openScreen();
		await openForEditing('Alpha');

		await typeTitle('');
		await page.getByRole('spinbutton', { name: 'Rounds' }).fill('100');
		await blockGroup(1).getByRole('textbox', { name: 'Block title' }).fill('');
		await blockGroup(1).getByRole('spinbutton', { name: 'Target (minutes)' }).fill('0');
		await blockGroup(2).getByRole('spinbutton', { name: 'Break (% of work)' }).fill('101');
		await blockGroup(2).getByRole('spinbutton', { name: 'Cycles' }).fill('100');

		const form = page.getByRole('form', { name: 'Edit routine' });
		await expect.element(form.getByText('Enter a title.').first()).toBeVisible();
		await expect
			.element(form.getByText('Enter a whole number of rounds, from 1 to 99.'))
			.toBeVisible();
		await expect
			.element(blockGroup(1).getByText('Enter a whole number of minutes, from 1 to 240.'))
			.toBeVisible();
		await expect
			.element(blockGroup(2).getByText('Enter a whole number of percent, from 1 to 100.'))
			.toBeVisible();
		await expect
			.element(blockGroup(2).getByText('Enter a whole number of cycles, from 1 to 99.'))
			.toBeVisible();
		await expect.element(form.getByRole('button', { name: 'Save' })).toBeDisabled();
	});

	it('marks a field with a problem as invalid, and Save works again once it is fixed', async () => {
		const { storage } = await openScreen();
		await openForEditing('Alpha');
		const title = page.getByRole('textbox', { name: 'Title', exact: true });

		await title.fill('   ');
		await expect.element(title).toBeInvalid();
		await expect.element(page.getByRole('button', { name: 'Save' })).toBeDisabled();
		await title.fill('Fixed');
		await expect.element(title).toBeValid();
		await page.getByRole('button', { name: 'Save' }).click();

		await expect.poll(async () => (await storage.getRoutines())[0]?.title).toBe('Fixed');
	});

	it('refuses a title of more than 50 characters', async () => {
		await openScreen();
		await openForEditing('Alpha');

		await typeTitle('x'.repeat(51));

		await expect.element(page.getByText('Use at most 50 characters.')).toBeVisible();
		await expect.element(page.getByRole('button', { name: 'Save' })).toBeDisabled();
	});
});

describe('discarding changes', () => {
	it('asks before opening another routine when there are unsaved changes, and keeps editing on Cancel', async () => {
		await openScreen();
		await openForEditing('Alpha');
		await typeTitle('Renamed');

		await cardOf('Bravo').getByRole('button', { name: 'Edit' }).click();

		const dialog = page.getByRole('dialog', { name: 'Discard changes?' });
		await expect.element(dialog).toBeVisible();
		await dialog.getByRole('button', { name: 'Cancel' }).click();
		await expect.element(dialog).not.toBeInTheDocument();
		await expect
			.element(page.getByRole('textbox', { name: 'Title', exact: true }))
			.toHaveValue('Renamed');
	});

	it('opens the other routine, and drops the changes, once the user discards them', async () => {
		const { storage } = await openScreen();
		await openForEditing('Alpha');
		await typeTitle('Renamed');
		await cardOf('Bravo').getByRole('button', { name: 'Edit' }).click();

		await page
			.getByRole('dialog', { name: 'Discard changes?' })
			.getByRole('button', { name: 'Discard' })
			.click();

		await expect
			.element(page.getByRole('textbox', { name: 'Title', exact: true }))
			.toHaveValue('Bravo');
		// Bravo's card is the form now, and Alpha is a card again, with its old title.
		expect(listedTitles()).toEqual(['Alpha', 'Charlie']);
		expect((await storage.getRoutines())[0]?.title).toBe('Alpha');
	});

	it('asks before starting a new routine when there are unsaved changes', async () => {
		await openScreen();
		await openForEditing('Alpha');
		await typeTitle('Renamed');

		await page.getByRole('button', { name: 'New routine' }).click();

		await expect.element(page.getByRole('dialog', { name: 'Discard changes?' })).toBeVisible();
	});

	it('opens the other routine without asking when nothing has changed', async () => {
		await openScreen();
		await openForEditing('Alpha');

		await cardOf('Bravo').getByRole('button', { name: 'Edit' }).click();

		await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
		await expect
			.element(page.getByRole('textbox', { name: 'Title', exact: true }))
			.toHaveValue('Bravo');
	});

	/**
	 * Makes the router's `beforeNavigate` callback, which the screen gave it, ask to leave.
	 *
	 * @param route - The route the user is going to.
	 * @returns The spy for `cancel`, which stops the navigation.
	 */
	function leaveFor(route: string): ReturnType<typeof vi.fn> {
		const callback = requireDefined(
			vi.mocked(beforeNavigate).mock.calls.at(-1)?.[0],
			'the screen’s beforeNavigate callback'
		);
		const cancel = vi.fn();
		const navigation = {
			cancel,
			willUnload: false,
			to: { route: { id: route } }
		} as unknown as BeforeNavigate;
		callback(navigation);
		return cancel;
	}

	it('asks before leaving the screen with unsaved changes, and goes on once discarded', async () => {
		await openScreen();
		await openForEditing('Alpha');
		await typeTitle('Renamed');

		const cancel = leaveFor('/stats');

		expect(cancel).toHaveBeenCalledOnce();
		const dialog = page.getByRole('dialog', { name: 'Discard changes?' });
		await expect.element(dialog).toBeVisible();
		await dialog.getByRole('button', { name: 'Discard' }).click();
		expect(goto).toHaveBeenCalledWith('/stats');
	});

	it('stays on the screen, editing, when the user cancels leaving', async () => {
		await openScreen();
		await openForEditing('Alpha');
		await typeTitle('Renamed');
		leaveFor('/stats');

		await page
			.getByRole('dialog', { name: 'Discard changes?' })
			.getByRole('button', { name: 'Cancel' })
			.click();

		expect(goto).not.toHaveBeenCalled();
		await expect
			.element(page.getByRole('textbox', { name: 'Title', exact: true }))
			.toHaveValue('Renamed');
	});

	it('lets the user leave without asking when nothing has changed', async () => {
		await openScreen();
		await openForEditing('Alpha');

		const cancel = leaveFor('/stats');

		expect(cancel).not.toHaveBeenCalled();
		await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
	});
});

describe('duplicating a routine', () => {
	it('adds a copy named “<title> (copy)” just below it, with the same blocks', async () => {
		const { storage } = await openScreen();

		await cardOf('Alpha').getByRole('button', { name: 'Duplicate' }).click();

		await expect.poll(listedTitles).toEqual(['Alpha', 'Alpha (copy)', 'Bravo', 'Charlie']);
		const copy = requireDefined((await storage.getRoutines())[1], 'the copy');
		expect(copy.blocks.map((block) => block.title)).toEqual(['Write', 'Review']);
		expect(copy.id).not.toBe('alpha');
		await expect.element(cardOf('Alpha (copy)').getByText('2 rounds · 2 blocks')).toBeVisible();
	});
});

describe('the keyboard focus', () => {
	/** The Title field of the open form. */
	const titleField = (): Locator => page.getByRole('textbox', { name: 'Title', exact: true });

	it('moves into the form’s Title field when a routine is opened for editing', async () => {
		await openScreen();

		await openForEditing('Bravo');

		await expect.element(titleField()).toHaveFocus();
	});

	it('moves into the Title field when New routine is pressed', async () => {
		await openScreen();

		await page.getByRole('button', { name: 'New routine' }).click();

		await expect.element(titleField()).toHaveFocus();
	});

	it('returns to the routine’s Edit button when its form is cancelled', async () => {
		await openScreen();
		await openForEditing('Bravo');

		await page.getByRole('button', { name: 'Cancel' }).click();

		await expect.element(cardOf('Bravo').getByRole('button', { name: 'Edit' })).toHaveFocus();
	});

	it('returns to New routine when a new routine’s form is cancelled', async () => {
		await openScreen();
		await page.getByRole('button', { name: 'New routine' }).click();

		await page.getByRole('button', { name: 'Cancel' }).click();

		await expect.element(page.getByRole('button', { name: 'New routine' })).toHaveFocus();
	});

	it('returns to the routine’s Edit button when its changes are saved', async () => {
		await openScreen();
		await openForEditing('Bravo');
		await typeTitle('Bravo renamed');

		await page.getByRole('button', { name: 'Save' }).click();

		await expect
			.element(cardOf('Bravo renamed').getByRole('button', { name: 'Edit' }))
			.toHaveFocus();
	});

	it('goes to the new routine’s Edit button when it is saved', async () => {
		await openScreen();
		await page.getByRole('button', { name: 'New routine' }).click();
		await typeTitle('Deep work');

		await page.getByRole('button', { name: 'Save' }).click();

		await expect.element(cardOf('Deep work').getByRole('button', { name: 'Edit' })).toHaveFocus();
	});

	it('goes to the Edit button of the routine that takes a deleted one’s place', async () => {
		await openScreen();
		await cardOf('Bravo').getByRole('button', { name: 'Delete' }).click();

		await page
			.getByRole('dialog', { name: 'Delete Bravo?' })
			.getByRole('button', { name: 'Delete' })
			.click();

		await expect.element(cardOf('Charlie').getByRole('button', { name: 'Edit' })).toHaveFocus();
	});

	it('goes to the Edit button of the routine above when the last one is deleted', async () => {
		await openScreen();
		await cardOf('Charlie').getByRole('button', { name: 'Delete' }).click();

		await page
			.getByRole('dialog', { name: 'Delete Charlie?' })
			.getByRole('button', { name: 'Delete' })
			.click();

		await expect.element(cardOf('Bravo').getByRole('button', { name: 'Edit' })).toHaveFocus();
	});

	it('goes to the heading of a running neighbour, whose Edit button is disabled', async () => {
		const [alpha, bravo] = threeRoutines();
		await openScreen([alpha as Routine, bravo as Routine], {}, [], 'alpha');
		await cardOf('Bravo').getByRole('button', { name: 'Delete' }).click();

		await page
			.getByRole('dialog', { name: 'Delete Bravo?' })
			.getByRole('button', { name: 'Delete' })
			.click();

		await expect.element(cardOf('Alpha').getByRole('heading', { name: 'Alpha' })).toHaveFocus();
	});

	it('goes to the heading of the routine whose locked form is cancelled', async () => {
		const { rerender } = await openScreen();
		await openForEditing('Bravo');
		await rerender({ runningRoutineId: 'bravo' });

		await page.getByRole('button', { name: 'Cancel' }).click();

		await expect.element(cardOf('Bravo').getByRole('heading', { name: 'Bravo' })).toHaveFocus();
	});
});

describe('deleting a routine', () => {
	it('asks first, and deletes the routine once confirmed', async () => {
		const { storage } = await openScreen();

		await cardOf('Bravo').getByRole('button', { name: 'Delete' }).click();

		const dialog = page.getByRole('dialog', { name: 'Delete Bravo?' });
		await expect
			.element(dialog.getByText('Its work stays in the stats, labelled as deleted.'))
			.toBeVisible();
		expect(listedTitles()).toEqual(['Alpha', 'Bravo', 'Charlie']);
		await dialog.getByRole('button', { name: 'Delete' }).click();
		await expect.poll(listedTitles).toEqual(['Alpha', 'Charlie']);
		expect(
			(await storage.getAllRoutines()).find((routine) => routine.id === 'bravo')?.deletedAt
		).toBe(NOW);
	});

	it('keeps the routine when the user cancels', async () => {
		const { storage } = await openScreen();
		await cardOf('Bravo').getByRole('button', { name: 'Delete' }).click();

		await page
			.getByRole('dialog', { name: 'Delete Bravo?' })
			.getByRole('button', { name: 'Cancel' })
			.click();

		expect(listedTitles()).toEqual(['Alpha', 'Bravo', 'Charlie']);
		expect(await storage.getRoutines()).toHaveLength(3);
	});

	it('disables Delete on the only routine left, with a hint that says why', async () => {
		await openScreen([threeRoutines()[0] as Routine]);

		await expect.element(cardOf('Alpha').getByRole('button', { name: 'Delete' })).toBeDisabled();
		await expect
			.element(
				cardOf('Alpha').getByText("This is your only routine, so it can't be deleted.", {
					exact: false
				})
			)
			.toBeVisible();
	});

	it('leaves Delete on while more than one routine is left, with no hint', async () => {
		await openScreen();

		await expect.element(cardOf('Alpha').getByRole('button', { name: 'Delete' })).toBeEnabled();
		await expect
			.element(page.getByText('your only routine', { exact: false }))
			.not.toBeInTheDocument();
	});

	it('disables Delete on the last routine after the others are deleted', async () => {
		await openScreen([threeRoutines()[0] as Routine, threeRoutines()[1] as Routine]);
		await cardOf('Bravo').getByRole('button', { name: 'Delete' }).click();
		await page
			.getByRole('dialog', { name: 'Delete Bravo?' })
			.getByRole('button', { name: 'Delete' })
			.click();

		await expect.element(cardOf('Alpha').getByRole('button', { name: 'Delete' })).toBeDisabled();
	});
});

describe('the routine of a run in progress', () => {
	it('can’t be edited or deleted, and says why', async () => {
		await openScreen(threeRoutines(), {}, [], 'bravo');

		const card = cardOf('Bravo');
		await expect.element(card.getByRole('button', { name: 'Edit' })).toBeDisabled();
		await expect.element(card.getByRole('button', { name: 'Delete' })).toBeDisabled();
		await expect
			.element(card.getByText('This routine is running, so it can', { exact: false }))
			.toBeVisible();
	});

	it('leaves the other routines alone, and the running one can still be duplicated and moved', async () => {
		await openScreen(threeRoutines(), {}, [], 'bravo');

		await expect.element(cardOf('Alpha').getByRole('button', { name: 'Edit' })).toBeEnabled();
		await expect.element(cardOf('Alpha').getByRole('button', { name: 'Delete' })).toBeEnabled();
		await expect.element(cardOf('Bravo').getByRole('button', { name: 'Duplicate' })).toBeEnabled();
		await expect.element(cardOf('Bravo').getByRole('button', { name: 'Move up' })).toBeEnabled();
	});

	it('enables Edit and Delete again once the run ends', async () => {
		const { rerender } = await openScreen(threeRoutines(), {}, [], 'bravo');

		await rerender({ runningRoutineId: null });

		await expect.element(cardOf('Bravo').getByRole('button', { name: 'Edit' })).toBeEnabled();
		await expect.element(cardOf('Bravo').getByRole('button', { name: 'Delete' })).toBeEnabled();
	});

	it('turns Save off, saying why, when a run of the routine being edited starts', async () => {
		const { storage, rerender } = await openScreen();
		await openForEditing('Alpha');
		await typeTitle('Renamed');

		await rerender({ runningRoutineId: 'alpha' });

		const form = page.getByRole('form', { name: 'Edit routine' });
		await expect.element(form.getByRole('button', { name: 'Save' })).toBeDisabled();
		await expect
			.element(form.getByText('A run of this routine has started', { exact: false }))
			.toBeVisible();
		expect((await storage.getRoutines())[0]?.title).toBe('Alpha');
	});

	it('doesn’t delete a routine whose run starts while the question is asked', async () => {
		const { storage, rerender } = await openScreen();
		await cardOf('Bravo').getByRole('button', { name: 'Delete' }).click();
		await rerender({ runningRoutineId: 'bravo' });

		await page
			.getByRole('dialog', { name: 'Delete Bravo?' })
			.getByRole('button', { name: 'Delete' })
			.click();

		expect(await storage.getRoutines()).toHaveLength(3);
	});
});

describe('a routine changed in another tab while it is edited', () => {
	it('closes the form with a notice when the routine is deleted, and leaves nothing to discard', async () => {
		const { storage } = await openScreen();
		await openForEditing('Alpha');
		await typeTitle('Renamed');

		await storage.deleteRoutine('alpha');

		await expect.element(page.getByRole('form', { name: 'Edit routine' })).not.toBeInTheDocument();
		await expect
			.element(
				page.getByRole('status').getByText('Alpha was deleted in another tab', { exact: false })
			)
			.toBeVisible();
		await cardOf('Bravo').getByRole('button', { name: 'Edit' }).click();
		await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
		await expect
			.element(page.getByRole('textbox', { name: 'Title', exact: true }))
			.toHaveValue('Bravo');
	});

	it('brings the drag handles back once the edited routine is deleted', async () => {
		const { storage } = await openScreen();
		await openForEditing('Alpha');
		await expect.element(page.getByRole('button', { name: 'Drag Bravo' })).not.toBeInTheDocument();

		await storage.deleteRoutine('alpha');

		await expect.element(page.getByRole('button', { name: 'Drag Bravo' })).toBeVisible();
	});

	it('says in the form that it was changed elsewhere and that Save overwrites it', async () => {
		const { storage } = await openScreen();
		await openForEditing('Alpha');
		await typeTitle('Mine');
		const alpha = requireDefined((await storage.getRoutines())[0], 'Alpha');

		await storage.saveRoutine({ ...alpha, title: 'Theirs' });

		await expect
			.element(page.getByRole('status').getByText('changed in another tab', { exact: false }))
			.toBeVisible();
		await expect.element(page.getByText('Save will overwrite', { exact: false })).toBeVisible();
		await expect
			.element(page.getByRole('textbox', { name: 'Title', exact: true }))
			.toHaveValue('Mine');
	});

	it('saves the user’s version over the other tab’s when Save is pressed', async () => {
		const { storage } = await openScreen();
		await openForEditing('Alpha');
		await typeTitle('Mine');
		const alpha = requireDefined((await storage.getRoutines())[0], 'Alpha');
		await storage.saveRoutine({ ...alpha, title: 'Theirs' });
		await expect.element(page.getByText('Save will overwrite', { exact: false })).toBeVisible();

		await page.getByRole('button', { name: 'Save' }).click();

		await expect.element(page.getByRole('form', { name: 'Edit routine' })).not.toBeInTheDocument();
		await expect.poll(async () => (await storage.getRoutines())[0]?.title).toBe('Mine');
		expect(listedTitles()).toEqual(['Mine', 'Bravo', 'Charlie']);
	});

	it('says nothing when only the routines’ order changed elsewhere', async () => {
		const { storage } = await openScreen();
		await openForEditing('Alpha');

		await storage.reorderRoutines(['bravo', 'alpha', 'charlie']);

		await expect.poll(listedTitles).toEqual(['Bravo', 'Charlie']);
		await expect
			.element(page.getByText('changed in another tab', { exact: false }))
			.not.toBeInTheDocument();
	});
});

describe('editing blocks', () => {
	it('adds a default block at the end', async () => {
		await openScreen();
		await openForEditing('Alpha');

		await page.getByRole('button', { name: 'Add block' }).click();

		const added = blockGroup(3);
		await expect.element(added.getByRole('textbox', { name: 'Block title' })).toHaveValue('Focus');
		await expect
			.element(added.getByRole('spinbutton', { name: 'Target (minutes)' }))
			.toHaveValue(25);
		await expect
			.element(added.getByRole('spinbutton', { name: 'Break (% of work)' }))
			.toHaveValue(20);
		await expect.element(added.getByRole('spinbutton', { name: 'Cycles' })).toHaveValue(1);
	});

	it('duplicates a block just below it', async () => {
		await openScreen();
		await openForEditing('Alpha');

		await blockGroup(1).getByRole('button', { name: 'Duplicate' }).click();

		await expect
			.element(blockGroup(2).getByRole('textbox', { name: 'Block title' }))
			.toHaveValue('Write');
		await expect.element(blockGroup(2).getByRole('spinbutton', { name: 'Cycles' })).toHaveValue(2);
		await expect
			.element(blockGroup(3).getByRole('textbox', { name: 'Block title' }))
			.toHaveValue('Review');
	});

	it('moves a block up and down', async () => {
		await openScreen();
		await openForEditing('Alpha');

		await blockGroup(2).getByRole('button', { name: 'Move up' }).click();
		await expect
			.element(blockGroup(1).getByRole('textbox', { name: 'Block title' }))
			.toHaveValue('Review');

		await blockGroup(1).getByRole('button', { name: 'Move down' }).click();
		await expect
			.element(blockGroup(1).getByRole('textbox', { name: 'Block title' }))
			.toHaveValue('Write');
	});

	it('can’t move the first block up or the last block down', async () => {
		await openScreen();
		await openForEditing('Alpha');

		await expect.element(blockGroup(1).getByRole('button', { name: 'Move up' })).toBeDisabled();
		await expect.element(blockGroup(2).getByRole('button', { name: 'Move down' })).toBeDisabled();
	});

	it('has a drag handle on each block', async () => {
		await openScreen();
		await openForEditing('Alpha');

		await expect.element(blockGroup(1).getByRole('button', { name: 'Drag block 1' })).toBeVisible();
		await expect.element(blockGroup(2).getByRole('button', { name: 'Drag block 2' })).toBeVisible();
	});

	it('keeps the block drag handles out of the Tab order, since Move up and Move down move by keyboard', async () => {
		await openScreen();
		await openForEditing('Alpha');

		const stops = await tabStops(60);

		expect(stops).toContain('Move down');
		expect(stops.filter((stop) => stop.startsWith('Drag'))).toEqual([]);
		expect(stops).not.toContain('Blocks');
	});

	it('asks before deleting a block, and removes it once confirmed', async () => {
		await openScreen();
		await openForEditing('Alpha');

		await blockGroup(1).getByRole('button', { name: 'Delete' }).click();

		const dialog = page.getByRole('dialog', { name: 'Delete block 1?' });
		await expect.element(dialog).toBeVisible();
		await dialog.getByRole('button', { name: 'Cancel' }).click();
		await expect.element(blockGroup(2)).toBeVisible();
		await blockGroup(1).getByRole('button', { name: 'Delete' }).click();
		await dialog.getByRole('button', { name: 'Delete' }).click();
		await expect.element(blockGroup(2)).not.toBeInTheDocument();
		await expect
			.element(blockGroup(1).getByRole('textbox', { name: 'Block title' }))
			.toHaveValue('Review');
	});

	it('disables Delete on the last block, with a hint', async () => {
		await openScreen();
		await openForEditing('Bravo');

		await expect.element(blockGroup(1).getByRole('button', { name: 'Delete' })).toBeDisabled();
		await expect
			.element(blockGroup(1).getByText('A routine needs at least one block', { exact: false }))
			.toBeVisible();
	});

	it('disables cycles with a hint while the routine has one block, showing 1', async () => {
		await openScreen();
		await openForEditing('Bravo');

		const cycles = blockGroup(1).getByRole('spinbutton', { name: 'Cycles' });
		await expect.element(cycles).toBeDisabled();
		await expect.element(cycles).toHaveValue(1);
		await expect
			.element(blockGroup(1).getByText('Rounds repeat a single block, so its cycles stay 1.'))
			.toBeVisible();
	});

	it('enables cycles when a second block is added', async () => {
		await openScreen();
		await openForEditing('Bravo');

		await page.getByRole('button', { name: 'Add block' }).click();

		await expect.element(blockGroup(1).getByRole('spinbutton', { name: 'Cycles' })).toBeEnabled();
	});

	it('resets the remaining block’s cycles to 1 when blocks are deleted down to one, keeping the rounds', async () => {
		const { storage } = await openScreen();
		await openForEditing('Alpha');

		await blockGroup(2).getByRole('button', { name: 'Delete' }).click();
		await page
			.getByRole('dialog', { name: 'Delete block 2?' })
			.getByRole('button', { name: 'Delete' })
			.click();

		const cycles = blockGroup(1).getByRole('spinbutton', { name: 'Cycles' });
		await expect.element(cycles).toHaveValue(1);
		await expect.element(cycles).toBeDisabled();
		await expect.element(page.getByRole('spinbutton', { name: 'Rounds' })).toHaveValue(2);
		await page.getByRole('button', { name: 'Save' }).click();
		await expect
			.poll(async () => (await storage.getRoutines())[0]?.blocks)
			.toEqual([blockWith('alpha-1', 'Write', 1)]);
	});

	it('turns Add block and Duplicate off at 20 blocks, saying why', async () => {
		const twentyBlocks = Array.from({ length: 20 }, (_, index) =>
			blockWith(`block-${index}`, `Block ${index}`)
		);
		await openScreen([routineWith({ id: 'full', title: 'Full', blocks: twentyBlocks })]);
		await openForEditing('Full');

		await expect.element(page.getByRole('button', { name: 'Add block' })).toBeDisabled();
		await expect.element(blockGroup(1).getByRole('button', { name: 'Duplicate' })).toBeDisabled();
		await expect.element(page.getByText('A routine has at most 20 blocks.')).toBeVisible();
	});

	it('saves the blocks in the order and with the edits the form shows', async () => {
		const { storage } = await openScreen();
		await openForEditing('Alpha');
		await blockGroup(1).getByRole('textbox', { name: 'Block title' }).fill('Deep work');
		await blockGroup(2).getByRole('button', { name: 'Move up' }).click();

		await page.getByRole('button', { name: 'Save' }).click();

		await expect
			.poll(async () => (await storage.getRoutines())[0]?.blocks.map((block) => block.title))
			.toEqual(['Review', 'Deep work']);
	});
});

// Takes away the log a test chose for errors.
afterEach(() => {
	useErrorLog(null);
});

describe('when reading fails', () => {
	/**
	 * Opens the screen on storage whose reads fail as a test sets up, with errors recorded in it.
	 *
	 * @param storage - The storage, already changed to fail.
	 */
	function openOn(storage: CadoroStorage): void {
		useErrorLog(storage);
		render(RoutinesScreen, {
			storage,
			settingsSession: new SettingsSession(storage, settingsFrom({})),
			initialRoutines: threeRoutines(),
			runningRoutineId: null,
			newId: numberedIds('new'),
			now: () => new Date(NOW)
		});
	}

	it('records in the activity log that the routines can no longer be followed', async () => {
		// Typed as the interface, which has the `onError` that `InMemoryStorage` leaves out.
		const storage: CadoroStorage = new InMemoryStorage();
		vi.spyOn(storage, 'watchRoutines').mockImplementation((_onChange, onError) => {
			onError(new Error('The routines could not be read.'));
			return (): void => {};
		});

		openOn(storage);

		await expect.poll(() => storage.getLogEntries()).toHaveLength(1);
		expect((await storage.getLogEntries())[0]).toMatchObject({
			type: 'error',
			message: 'Changes to the routines can no longer be followed.',
			details: { message: 'The routines could not be read.' }
		});
	});

	it('records in the activity log that the runs could not be read, and still lists the routines', async () => {
		const storage = new InMemoryStorage();
		await storage.addRoutinesIfNone(threeRoutines());
		vi.spyOn(storage, 'getRuns').mockRejectedValue(new Error('The disk could not be read.'));

		openOn(storage);

		await expect.poll(() => storage.getLogEntries()).toHaveLength(1);
		expect((await storage.getLogEntries())[0]).toMatchObject({
			type: 'error',
			message: 'The runs could not be read, so "last used" and "most work" are off.',
			details: { message: 'The disk could not be read.' }
		});
		await expect.poll(() => listedTitles()).toEqual(['Alpha', 'Bravo', 'Charlie']);
	});
});

describe('when saving fails', () => {
	it('says so, and keeps the form open with the changes', async () => {
		const { storage } = await openScreen();
		vi.spyOn(storage, 'saveRoutine').mockRejectedValue(new Error('The disk is full.'));
		await openForEditing('Alpha');
		await typeTitle('Renamed');

		await page.getByRole('button', { name: 'Save' }).click();

		await expect
			.element(page.getByRole('form', { name: 'Edit routine' }).getByRole('alert'))
			.toHaveTextContent('The routine could not be saved. Try again.');
		await expect
			.element(page.getByRole('textbox', { name: 'Title', exact: true }))
			.toHaveValue('Renamed');
	});

	it('keeps the warning that the routine changed elsewhere while the save was running', async () => {
		const { storage } = await openScreen();
		const { promise: failure, reject: failSave } = Promise.withResolvers<void>();
		const saveRoutine = vi.spyOn(storage, 'saveRoutine').mockImplementationOnce(() => failure);
		await openForEditing('Alpha');
		await typeTitle('Mine');
		const alpha = requireDefined((await storage.getRoutines())[0], 'Alpha');
		await page.getByRole('button', { name: 'Save' }).click();
		await expect.poll(() => saveRoutine.mock.calls).toHaveLength(1);

		// Another tab changes the routine while the save is still running, then the save fails.
		await storage.saveRoutine({ ...alpha, title: 'Theirs' });
		await expect
			.element(page.getByRole('status').getByText('changed in another tab', { exact: false }))
			.toBeVisible();
		failSave(new Error('The disk is full.'));

		await expect
			.element(page.getByRole('form', { name: 'Edit routine' }).getByRole('alert'))
			.toHaveTextContent('The routine could not be saved. Try again.');
		await expect.element(page.getByText('Save will overwrite', { exact: false })).toBeVisible();
	});

	it('records the failure in the activity log', async () => {
		const { storage } = await openScreen();
		useErrorLog(storage);
		vi.spyOn(storage, 'saveRoutine').mockRejectedValue(new Error('The disk is full.'));
		await openForEditing('Alpha');
		await typeTitle('Renamed');

		await page.getByRole('button', { name: 'Save' }).click();

		await expect.poll(() => storage.getLogEntries()).toHaveLength(1);
		expect((await storage.getLogEntries())[0]).toMatchObject({
			type: 'error',
			message: 'Saving the routine failed.',
			details: { message: 'The disk is full.' }
		});
	});

	it('records a failed duplicate in the activity log, and adds no copy', async () => {
		const { storage } = await openScreen();
		useErrorLog(storage);
		vi.spyOn(storage, 'duplicateRoutine').mockRejectedValue(new Error('The disk is full.'));

		await cardOf('Alpha').getByRole('button', { name: 'Duplicate' }).click();

		await expect.poll(() => storage.getLogEntries()).toHaveLength(1);
		expect((await storage.getLogEntries())[0]).toMatchObject({
			type: 'error',
			message: 'Duplicating the routine failed.',
			details: { message: 'The disk is full.' }
		});
		expect(listedTitles()).toEqual(['Alpha', 'Bravo', 'Charlie']);
	});

	it('tells the user a duplicate failed, and clears the message on the next action', async () => {
		const { storage } = await openScreen();
		const duplicate = vi
			.spyOn(storage, 'duplicateRoutine')
			.mockRejectedValueOnce(new Error('The disk is full.'));

		await cardOf('Alpha').getByRole('button', { name: 'Duplicate' }).click();

		const message = page.getByRole('alert').filter({ hasText: 'could not be duplicated' });
		await expect
			.element(message)
			.toHaveTextContent('The routine could not be duplicated. Try again.');
		await cardOf('Alpha').getByRole('button', { name: 'Duplicate' }).click();
		await expect.poll(() => duplicate.mock.calls).toHaveLength(2);
		await expect.element(message).not.toBeInTheDocument();
	});

	it('tells the user a delete failed', async () => {
		const { storage } = await openScreen();
		vi.spyOn(storage, 'deleteRoutine').mockRejectedValue(new Error('The disk is full.'));
		await cardOf('Bravo').getByRole('button', { name: 'Delete' }).click();

		await page
			.getByRole('dialog', { name: 'Delete Bravo?' })
			.getByRole('button', { name: 'Delete' })
			.click();

		await expect
			.element(page.getByRole('alert').filter({ hasText: 'could not be deleted' }))
			.toHaveTextContent('The routine could not be deleted. Try again.');
	});

	it('tells the user a move failed', async () => {
		const { storage } = await openScreen();
		vi.spyOn(storage, 'reorderRoutines').mockRejectedValue(new Error('The disk is full.'));

		await cardOf('Bravo').getByRole('button', { name: 'Move up' }).click();

		await expect
			.element(page.getByRole('alert').filter({ hasText: 'could not be moved' }))
			.toHaveTextContent('The routines could not be moved. Try again.');
	});

	it('records a failed delete in the activity log, and keeps the routine', async () => {
		const { storage } = await openScreen();
		useErrorLog(storage);
		vi.spyOn(storage, 'deleteRoutine').mockRejectedValue(new Error('The disk is full.'));
		await cardOf('Bravo').getByRole('button', { name: 'Delete' }).click();

		await page
			.getByRole('dialog', { name: 'Delete Bravo?' })
			.getByRole('button', { name: 'Delete' })
			.click();

		await expect.poll(() => storage.getLogEntries()).toHaveLength(1);
		expect((await storage.getLogEntries())[0]).toMatchObject({
			type: 'error',
			message: 'Deleting the routine failed.',
			details: { message: 'The disk is full.' }
		});
		expect(listedTitles()).toEqual(['Alpha', 'Bravo', 'Charlie']);
	});

	it('records a failed move in the activity log, and puts the routines back in their saved order', async () => {
		const { storage } = await openScreen();
		useErrorLog(storage);
		vi.spyOn(storage, 'reorderRoutines').mockRejectedValue(new Error('The disk is full.'));

		await cardOf('Bravo').getByRole('button', { name: 'Move up' }).click();

		await expect.poll(() => storage.getLogEntries()).toHaveLength(1);
		expect((await storage.getLogEntries())[0]).toMatchObject({
			type: 'error',
			message: 'Reordering the routines failed.',
			details: { message: 'The disk is full.' }
		});
		await expect.poll(listedTitles).toEqual(['Alpha', 'Bravo', 'Charlie']);
	});
});
