import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import ScreenNav from './ScreenNav.svelte';

describe('the screen navigation', () => {
	it('links to every screen, in order, inside the Screens landmark', async () => {
		render(ScreenNav, { currentRoute: '/' });

		const links = page.getByRole('navigation', { name: 'Screens' }).getByRole('link');
		await expect.element(links.first()).toBeVisible();
		const linkNames = links.all().map((link) => link.element().textContent.trim());
		expect(linkNames).toEqual(['Timer', 'Routines', 'Stats', 'Settings']);
	});

	it.each([
		['Timer', '/'],
		['Routines', '/routines'],
		['Stats', '/stats'],
		['Settings', '/settings']
	])('links %s to %s', async (name, path) => {
		render(ScreenNav, { currentRoute: '/' });

		await expect.element(page.getByRole('link', { name })).toHaveAttribute('href', path);
	});

	it('marks only the current screen as the current page', async () => {
		render(ScreenNav, { currentRoute: '/routines' });

		await expect
			.element(page.getByRole('link', { name: 'Routines' }))
			.toHaveAttribute('aria-current', 'page');
		for (const name of ['Timer', 'Stats', 'Settings']) {
			await expect.element(page.getByRole('link', { name })).not.toHaveAttribute('aria-current');
		}
	});

	it('marks a screen as current on a page inside it', async () => {
		render(ScreenNav, { currentRoute: '/settings/activity' });

		await expect
			.element(page.getByRole('link', { name: 'Settings' }))
			.toHaveAttribute('aria-current', 'page');
	});

	it('marks no screen as current when the URL matches no route', async () => {
		render(ScreenNav, { currentRoute: null });

		for (const name of ['Timer', 'Routines', 'Stats', 'Settings']) {
			await expect.element(page.getByRole('link', { name })).not.toHaveAttribute('aria-current');
		}
	});
});
