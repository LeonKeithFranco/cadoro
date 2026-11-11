import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import ScreenPlaceholder from './ScreenPlaceholder.svelte';

describe('a placeholder screen', () => {
	it('shows its title as the heading and what the screen will hold', async () => {
		render(ScreenPlaceholder, { title: 'Stats', message: 'Stats will show here.' });

		await expect.element(page.getByRole('heading', { level: 1, name: 'Stats' })).toBeVisible();
		await expect.element(page.getByText('Stats will show here.')).toBeVisible();
	});

	it('names the browser tab after the screen and the app', async () => {
		render(ScreenPlaceholder, { title: 'Stats', message: 'Stats will show here.' });

		await expect.poll(() => document.title).toBe('Stats · Cadoro');
	});
});
