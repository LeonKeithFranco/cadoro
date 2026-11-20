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
		const breakPercent = blockGroup(page, 1).getByRole('spinbutton', { name: 'Break (% of work)' });
		await expect(breakPercent).toHaveAccessibleDescription('10:00 break at the 50-minute target');
		await breakPercent.fill('10');
		await expect(breakPercent).toHaveAccessibleDescription('5:00 break at the 50-minute target');

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

test('tabbing through the routines never leaves a control under the fixed tab bar', async ({
	page
}) => {
	await page.goto('/routines');
	await expect(routineList(page).getByRole('heading', { level: 2 })).toHaveCount(2);
	// Short enough that the cards run under the tab bar and the page has to scroll. Only the
	// phone's layout fixes the bar, so on the desktop's the check passes without finding one.
	const viewport = page.viewportSize();
	if (viewport === null) {
		throw new Error('Expected the page to have a viewport.');
	}
	await page.setViewportSize({ width: viewport.width, height: 420 });

	const controlCount = await page.locator('main button:not(:disabled)').count();
	await test.step('each control Tab reaches is fully above the tab bar, even one that began half under it', async () => {
		for (let index = 1; index < controlCount; index++) {
			// Scrolls the page so the next control sits just inside the tab bar's strip, with the
			// control before it focused, so Tab moves on to a control the browser already counts as
			// on screen.
			await page.evaluate((nextIndex) => {
				const controls = [...document.querySelectorAll<HTMLElement>('main button:not(:disabled)')];
				const bar = document.querySelector('nav');
				const next = controls[nextIndex];
				if (bar === null || next === undefined) {
					return;
				}
				controls[nextIndex - 1]?.focus({ preventScroll: true });
				const stripMiddle =
					bar.getBoundingClientRect().top + bar.getBoundingClientRect().height / 2;
				window.scrollBy(0, next.getBoundingClientRect().bottom - stripMiddle);
			}, index);

			await page.keyboard.press('Tab');

			const isUnderTabBar = await page.evaluate(() => {
				const bar = document.querySelector('nav');
				const focused = document.activeElement;
				if (bar === null || focused === null || bar.contains(focused)) {
					return false;
				}
				if (getComputedStyle(bar).position !== 'fixed') {
					return false;
				}
				return focused.getBoundingClientRect().bottom > bar.getBoundingClientRect().top;
			});
			expect(isUnderTabBar, `Control ${index + 1} of ${controlCount}`).toBe(false);
		}
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

test('dragging a block’s handle in the editor moves the block, and Save keeps the order', async ({
	page
}) => {
	await page.goto('/routines');
	await cardOf(page, 'Classic with long break').getByRole('button', { name: 'Edit' }).click();
	// Inside the list, so the copy of a block that follows the pointer during a drag isn't counted.
	const blockTitles = page
		.getByRole('list', { name: 'Blocks' })
		.getByRole('textbox', { name: 'Block title' });
	const originalTitles = await blockTitles.evaluateAll((fields) =>
		fields.map((field) => (field as HTMLInputElement).value)
	);
	expect(originalTitles).toHaveLength(2);
	// The mouse works in the window's coordinates, so both blocks must be on screen at once, which
	// the phone's height doesn't allow: each block is about as tall as the screen.
	const { width } = page.viewportSize() ?? { width: 1280 };
	await page.setViewportSize({ width, height: 2400 });

	await dragOnto(
		page,
		page.getByRole('button', { name: 'Drag block 1', exact: true }),
		blockGroup(page, 2)
	);

	const swapped = [...originalTitles].reverse();
	await expect(blockTitles.first()).toHaveValue(swapped[0] ?? '');
	await expect(blockTitles.nth(1)).toHaveValue(swapped[1] ?? '');
	await page.getByRole('button', { name: 'Save' }).click();
	await cardOf(page, 'Classic with long break').getByRole('button', { name: 'Edit' }).click();
	await expect(blockTitles.first()).toHaveValue(swapped[0] ?? '');
	await expect(blockTitles.nth(1)).toHaveValue(swapped[1] ?? '');
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

test('browser back with unsaved changes asks to discard them, and Cancel stays', async ({
	page
}) => {
	await page.goto('/');
	await followLink(
		page,
		page.getByRole('navigation', { name: 'Screens' }).getByRole('link', { name: 'Routines' })
	);
	await cardOf(page, 'Classic').getByRole('button', { name: 'Edit' }).click();
	await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Changed');

	await page.goBack();

	const dialog = page.getByRole('dialog', { name: 'Discard changes?' });
	await expect(dialog).toBeVisible();
	await dialog.getByRole('button', { name: 'Cancel' }).click();
	await expect(page).toHaveURL('/routines');
	await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue('Changed');

	await page.goBack();
	await dialog.getByRole('button', { name: 'Discard' }).click();
	await expect(page).toHaveURL('/');
});

// Closing the tab, a reload and a typed address all run the page's `beforeunload` handlers the
// same way, and `page.close({ runBeforeUnload: true })` is Playwright's way to run them without
// leaving the page unless the browser lets it.
test('leaving the page with unsaved changes gets the browser’s own prompt, and staying keeps them', async ({
	page
}) => {
	await page.goto('/routines');
	await cardOf(page, 'Classic').getByRole('button', { name: 'Edit' }).click();
	await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Changed');
	const dialogTypes: string[] = [];
	page.on('dialog', (dialog) => {
		dialogTypes.push(dialog.type());
		void dialog.dismiss();
	});

	await page.close({ runBeforeUnload: true });

	// With `runBeforeUnload`, `close` returns before the browser has asked.
	await expect.poll(() => dialogTypes).toEqual(['beforeunload']);
	expect(page.isClosed()).toBe(false);
	await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue('Changed');
});

test('leaving the page with no unsaved changes gets no prompt', async ({ page }) => {
	await page.goto('/routines');
	await cardOf(page, 'Classic').getByRole('button', { name: 'Edit' }).click();
	const dialogTypes: string[] = [];
	page.on('dialog', (dialog) => {
		dialogTypes.push(dialog.type());
		void dialog.dismiss();
	});

	await page.close({ runBeforeUnload: true });

	// With `runBeforeUnload`, `close` returns before the page has gone.
	await expect.poll(() => page.isClosed()).toBe(true);
	expect(dialogTypes).toEqual([]);
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

	await test.step('both stay off while the ended run’s summary is open, so a reload still finds it', async () => {
		await firstTab.getByRole('button', { name: 'Finish' }).click();
		await firstTab
			.getByRole('dialog', { name: 'Finish this run?' })
			.getByRole('button', { name: 'Finish' })
			.click();
		await settle(firstTab);

		const running = cardOf(secondTab, 'Classic');
		await expect(running.getByRole('button', { name: 'Edit' })).toBeDisabled();
		await expect(running.getByRole('button', { name: 'Delete' })).toBeDisabled();
	});

	await test.step('both come back once the summary is closed', async () => {
		await firstTab
			.getByRole('dialog', { name: 'Run summary' })
			.getByRole('button', { name: 'Done' })
			.click();
		await settle(firstTab);

		const running = cardOf(secondTab, 'Classic');
		await expect(running.getByRole('button', { name: 'Edit' })).toBeEnabled();
		await expect(running.getByRole('button', { name: 'Delete' })).toBeEnabled();
	});
});
