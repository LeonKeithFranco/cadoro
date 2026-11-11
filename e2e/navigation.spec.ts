import { expect, test, type Page } from '@playwright/test';

/** A screen the journey visits. */
type Screen = {
	/** The screen's name: its link, its heading and the start of its tab title. */
	name: string;
	/** The screen's path. */
	path: string;
};

/** Every screen other than the Timer, which the app opens on. */
const OTHER_SCREENS: Screen[] = [
	{ name: 'Routines', path: '/routines' },
	{ name: 'Stats', path: '/stats' },
	{ name: 'Settings', path: '/settings' }
];

/**
 * Checks that a screen is showing, as someone using the app would see it: its address, tab
 * title and heading, with its link marked as the current page.
 *
 * @param page - The browser page.
 * @param screen - The screen that should be showing.
 */
async function expectScreenShowing(page: Page, screen: Screen) {
	const navigation = page.getByRole('navigation', { name: 'Screens' });

	await expect(page).toHaveURL(screen.path);
	await expect(page).toHaveTitle(`${screen.name} · Cadoro`);
	await expect(page.getByRole('heading', { level: 1, name: screen.name })).toBeVisible();
	await expect(navigation.getByRole('link', { name: screen.name })).toHaveAttribute(
		'aria-current',
		'page'
	);
}

test('the app opens on the Timer screen', async ({ page }) => {
	await page.goto('/');

	await expectScreenShowing(page, { name: 'Timer', path: '/' });
});

test('the navigation goes to every screen and back to the Timer', async ({ page }) => {
	await page.goto('/');
	const navigation = page.getByRole('navigation', { name: 'Screens' });

	for (const screen of OTHER_SCREENS) {
		await navigation.getByRole('link', { name: screen.name }).click();
		await expectScreenShowing(page, screen);
	}

	await navigation.getByRole('link', { name: 'Timer' }).click();
	await expectScreenShowing(page, { name: 'Timer', path: '/' });
});

for (const screen of OTHER_SCREENS) {
	test(`opening ${screen.path} directly shows the ${screen.name} screen`, async ({ page }) => {
		await page.goto(screen.path);

		await expectScreenShowing(page, screen);
	});
}
