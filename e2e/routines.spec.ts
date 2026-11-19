import { expect, test, type Locator, type Page } from '@playwright/test';
import { minutes } from '../src/lib/testing/durations';
import { followLink, openOnPausedClock } from './clock';

/**
 * How long the paused clock runs to let the app notice a change saved to storage, in
 * milliseconds. Dexie's live query waits on a timer before telling the app about a change, and
 * the fake clock holds every timer back until it moves.
 */
const SETTLE_MS = 100;

/**
 * Lets the app show a change that storage reported, when the clock is paused.
 *
 * @param page - The page.
 */
async function settle(page: Page): Promise<void> {
	await page.clock.runFor(SETTLE_MS);
}

/**
 * Finds the list of routines on the Routines screen.
 *
 * @param page - The page.
 * @returns The list.
 */
function routineList(page: Page): Locator {
	return page.getByRole('list', { name: 'Routines' });
}

/**
 * Finds a routine's card in the list.
 *
 * @param page - The page.
 * @param title - The routine's title, in full.
 * @returns The list item holding the routine.
 */
function cardOf(page: Page, title: string): Locator {
	return routineList(page).getByRole('listitem', { name: title, exact: true });
}

/**
 * Finds a block's form in the open routine form.
 *
 * @param page - The page.
 * @param position - The block's place, counting from 1.
 * @returns The block's group.
 */
function blockGroup(page: Page, position: number): Locator {
	return page.getByRole('group', { name: `Block ${position}`, exact: true });
}

/**
 * Reads the titles of the routines in the list, top to bottom.
 *
 * @param page - The page.
 * @returns The titles.
 */
async function listedTitles(page: Page): Promise<string[]> {
	return routineList(page).getByRole('heading', { level: 2 }).allTextContents();
}

/**
 * Drags a card's handle down the list with the mouse, as a user does, and drops it on a card.
 *
 * @param page - The page.
 * @param handle - The handle to drag.
 * @param target - The card to drop it onto, which it takes the place of.
 */
async function dragOnto(page: Page, handle: Locator, target: Locator): Promise<void> {
	const from = await handle.boundingBox();
	const to = await target.boundingBox();
	if (from === null || to === null) {
		throw new Error('Expected the handle and the card to be on the page.');
	}

	const startX = from.x + from.width / 2;
	const startY = from.y + from.height / 2;
	await page.mouse.move(startX, startY);
	await page.mouse.down();
	// A few small moves first, which start the drag, then a long one over the card.
	await page.mouse.move(startX, startY + 10, { steps: 5 });
	// The library marks the placeholder it leaves in the list once the drag has started, which it
	// does a moment after the first moves, so the long move waits for it.
	await expect(page.locator('[data-is-dnd-shadow-item-internal="true"]')).toBeAttached();
	// The pointer holds the handle, near the top of its card, so the card's middle is lower than
	// the pointer. Aiming at the target's upper half keeps the dragged card inside the list, as
	// one dropped past its end counts as dropped outside and goes back.
	await page.mouse.move(startX, to.y + to.height * 0.4, { steps: 25 });
	// A last small move over the card, so the library sees the pointer settle on it.
	await page.mouse.move(startX, to.y + to.height * 0.45, { steps: 5 });
	await page.mouse.up();
}

test('a routine is created, edited, reordered and deleted, and the changes are kept', async ({
	page
}) => {
	await page.goto('/routines');
	await expect(routineList(page).getByRole('heading', { level: 2 })).toHaveText([
		'Classic',
		'Classic with long break'
	]);

	await test.step('a new routine is built in a form at the top and saved', async () => {
		await page.getByRole('button', { name: 'New routine' }).click();
		await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();
		await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Writing');
		await page.getByRole('checkbox', { name: 'Repeat forever' }).uncheck();
		await page.getByRole('spinbutton', { name: 'Rounds' }).fill('3');
		await blockGroup(page, 1).getByRole('textbox', { name: 'Block title' }).fill('Draft');
		await blockGroup(page, 1).getByRole('spinbutton', { name: 'Target (minutes)' }).fill('50');

		await page.getByRole('button', { name: 'Save' }).click();

		await expect(routineList(page).getByRole('heading', { level: 2 })).toHaveText([
			'Writing',
			'Classic',
			'Classic with long break'
		]);
		await expect(cardOf(page, 'Writing')).toContainText('3 rounds · 1 block');
	});

	await test.step('an edit changes the routine in place', async () => {
		await cardOf(page, 'Writing').getByRole('button', { name: 'Edit' }).click();
		await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Writing sprint');
		await page.getByRole('button', { name: 'Save' }).click();

		await expect(cardOf(page, 'Writing sprint')).toBeVisible();
		await expect(cardOf(page, 'Writing')).toHaveCount(0);
	});

	await test.step('Move down and Move up change the order', async () => {
		await cardOf(page, 'Writing sprint').getByRole('button', { name: 'Move down' }).click();
		await expect
			.poll(() => listedTitles(page))
			.toEqual(['Classic', 'Writing sprint', 'Classic with long break']);

		await cardOf(page, 'Writing sprint').getByRole('button', { name: 'Move up' }).click();
		await expect
			.poll(() => listedTitles(page))
			.toEqual(['Writing sprint', 'Classic', 'Classic with long break']);
	});

	await test.step('Delete asks first, and the deleted routine stays gone after a reload', async () => {
		await cardOf(page, 'Writing sprint').getByRole('button', { name: 'Delete' }).click();
		const dialog = page.getByRole('dialog', { name: 'Delete Writing sprint?' });
		await dialog.getByRole('button', { name: 'Cancel' }).click();
		await expect(cardOf(page, 'Writing sprint')).toBeVisible();

		await cardOf(page, 'Writing sprint').getByRole('button', { name: 'Delete' }).click();
		await dialog.getByRole('button', { name: 'Delete' }).click();

		await expect(cardOf(page, 'Writing sprint')).toHaveCount(0);
		await page.reload();
		await expect(routineList(page).getByRole('heading', { level: 2 })).toHaveText([
			'Classic',
			'Classic with long break'
		]);
	});

	await test.step('the last routine can’t be deleted', async () => {
		await cardOf(page, 'Classic').getByRole('button', { name: 'Delete' }).click();
		await page
			.getByRole('dialog', { name: 'Delete Classic?' })
			.getByRole('button', { name: 'Delete' })
			.click();
		await expect(cardOf(page, 'Classic')).toHaveCount(0);

		const lastCard = cardOf(page, 'Classic with long break');
		await expect(lastCard.getByRole('button', { name: 'Delete' })).toBeDisabled();
		await expect(lastCard).toContainText('This is your only routine');
	});
});

test('dragging a routine’s handle with the mouse moves it, and the order is kept', async ({
	page
}) => {
	await page.goto('/routines');

	await dragOnto(
		page,
		page.getByRole('button', { name: 'Drag Classic', exact: true }),
		cardOf(page, 'Classic with long break')
	);

	await expect.poll(() => listedTitles(page)).toEqual(['Classic with long break', 'Classic']);
	await page.reload();
	await expect.poll(() => listedTitles(page)).toEqual(['Classic with long break', 'Classic']);
});

test('opening another routine, or leaving the screen, with unsaved changes asks to discard them', async ({
	page
}) => {
	await page.goto('/routines');
	await cardOf(page, 'Classic').getByRole('button', { name: 'Edit' }).click();
	await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Changed');
	const dialog = page.getByRole('dialog', { name: 'Discard changes?' });

	await test.step('opening another routine asks, and Cancel keeps the changes', async () => {
		await cardOf(page, 'Classic with long break').getByRole('button', { name: 'Edit' }).click();

		await expect(dialog).toBeVisible();
		await dialog.getByRole('button', { name: 'Cancel' }).click();
		await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue('Changed');
	});

	await test.step('leaving by a link asks too, and Cancel stays', async () => {
		await page
			.getByRole('navigation', { name: 'Screens' })
			.getByRole('link', { name: 'Stats' })
			.click();

		await expect(dialog).toBeVisible();
		await dialog.getByRole('button', { name: 'Cancel' }).click();
		await expect(page).toHaveURL('/routines');
		await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue('Changed');
	});

	await test.step('discarding goes on to the screen, and the changes are gone', async () => {
		await page
			.getByRole('navigation', { name: 'Screens' })
			.getByRole('link', { name: 'Stats' })
			.click();
		await dialog.getByRole('button', { name: 'Discard' }).click();

		await expect(page).toHaveURL('/stats');
		await page
			.getByRole('navigation', { name: 'Screens' })
			.getByRole('link', { name: 'Routines' })
			.click();
		await expect(cardOf(page, 'Classic')).toBeVisible();
	});
});

test('a routine with two blocks runs exactly as built: each target, break, cycle and round', async ({
	page
}) => {
	await openOnPausedClock(page, '/routines');
	const navigation = page.getByRole('navigation', { name: 'Screens' });

	await test.step('build Two blocks: 2 rounds of Draft (10 min, 50% break, 2 cycles) then Polish (5 min, 20%)', async () => {
		await page.getByRole('button', { name: 'New routine' }).click();
		await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Two blocks');
		await page.getByRole('checkbox', { name: 'Repeat forever' }).uncheck();
		await page.getByRole('spinbutton', { name: 'Rounds' }).fill('2');
		await blockGroup(page, 1).getByRole('textbox', { name: 'Block title' }).fill('Draft');
		await blockGroup(page, 1).getByRole('spinbutton', { name: 'Target (minutes)' }).fill('10');
		await blockGroup(page, 1).getByRole('spinbutton', { name: 'Break (% of work)' }).fill('50');
		await page.getByRole('button', { name: 'Add block' }).click();
		await blockGroup(page, 2).getByRole('textbox', { name: 'Block title' }).fill('Polish');
		await blockGroup(page, 2).getByRole('spinbutton', { name: 'Target (minutes)' }).fill('5');
		await blockGroup(page, 1).getByRole('spinbutton', { name: 'Cycles' }).fill('2');

		await page.getByRole('button', { name: 'Save' }).click();
		await settle(page);

		await expect(cardOf(page, 'Two blocks')).toContainText('2 rounds · 2 blocks');
	});

	await followLink(page, navigation.getByRole('link', { name: 'Timer' }));
	await settle(page);
	await page.getByRole('combobox', { name: 'Routine' }).selectOption('Two blocks');
	const draftBreak = page
		.getByRole('region', { name: 'Draft' })
		.getByRole('group', { name: /^Break/ });
	const draftWork = page
		.getByRole('region', { name: 'Draft' })
		.getByRole('group', { name: /^Work/ });
	const polishBreak = page
		.getByRole('region', { name: 'Polish' })
		.getByRole('group', { name: /^Break/ });
	const next = page.getByRole('button', { name: 'Next' });
	await expect(
		page.getByText('Round 1 of 2 · Block 1 of 2 · Cycle 1 of 2', { exact: true })
	).toBeVisible();

	await test.step('Draft’s first cycle: 10 minutes of work earns a 5:00 break', async () => {
		await page.getByRole('button', { name: 'Play' }).click();
		await page.clock.fastForward(minutes(10));
		await expect(draftWork).toContainText('10:00 / 10:00');

		await next.click();

		await expect(draftBreak).toContainText('5:00');
		await next.click();
		await expect(
			page.getByText('Round 1 of 2 · Block 1 of 2 · Cycle 2 of 2', { exact: true })
		).toBeVisible();
	});

	await test.step('Draft’s second cycle, then Polish: 5 minutes of work earns a 1:00 break', async () => {
		await page.clock.fastForward(minutes(10));
		await next.click();
		await expect(draftBreak).toContainText('5:00');
		await next.click();
		await expect(page.getByText('Round 1 of 2 · Block 2 of 2', { exact: true })).toBeVisible();

		await page.clock.fastForward(minutes(5));
		await next.click();

		await expect(polishBreak).toContainText('1:00');
		await next.click();
	});

	await test.step('round 2 starts at Draft’s first cycle again', async () => {
		await expect(
			page.getByText('Round 2 of 2 · Block 1 of 2 · Cycle 1 of 2', { exact: true })
		).toBeVisible();
	});

	await test.step('the last work period of the last round ends the run, with its summary', async () => {
		await page.clock.fastForward(minutes(10));
		await next.click();
		await next.click();
		await page.clock.fastForward(minutes(10));
		await next.click();
		await next.click();
		await expect(page.getByText('Round 2 of 2 · Block 2 of 2', { exact: true })).toBeVisible();
		await page.clock.fastForward(minutes(5));

		await next.click();

		const summary = page.getByRole('dialog', { name: 'Run summary' });
		await expect(summary).toContainText('Two blocks');
		// Two rounds of 10 + 10 + 5 minutes.
		await expect(summary).toContainText('50:00');
	});
});

test('the routine being run can’t be edited or deleted, in any tab, until the run ends', async ({
	page
}) => {
	const firstTab = page;
	await openOnPausedClock(firstTab, '/');
	await firstTab.getByRole('button', { name: 'Play' }).click();
	await firstTab.clock.fastForward(minutes(1));

	const secondTab = await firstTab.context().newPage();
	await secondTab.goto('/routines');
	await settle(firstTab);

	await test.step('Edit and Delete are off for it, with the reason, and on for the others', async () => {
		const running = cardOf(secondTab, 'Classic');
		await expect(running.getByRole('button', { name: 'Edit' })).toBeDisabled();
		await expect(running.getByRole('button', { name: 'Delete' })).toBeDisabled();
		await expect(running).toContainText('This routine is running');
		const other = cardOf(secondTab, 'Classic with long break');
		await expect(other.getByRole('button', { name: 'Edit' })).toBeEnabled();
		await expect(other.getByRole('button', { name: 'Delete' })).toBeEnabled();
	});

	await test.step('both come back once the run ends', async () => {
		await firstTab.getByRole('button', { name: 'Finish' }).click();
		await firstTab
			.getByRole('dialog', { name: 'Finish this run?' })
			.getByRole('button', { name: 'Finish' })
			.click();
		await settle(firstTab);

		const running = cardOf(secondTab, 'Classic');
		await expect(running.getByRole('button', { name: 'Edit' })).toBeEnabled();
		await expect(running.getByRole('button', { name: 'Delete' })).toBeEnabled();
	});
});
