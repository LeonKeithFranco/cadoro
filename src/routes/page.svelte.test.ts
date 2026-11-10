import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Page from './+page.svelte';

describe('the home page', () => {
	it('shows the app name and that the timer is coming', async () => {
		render(Page);

		await expect
			.element(page.getByRole('heading', { level: 1, name: 'Cadoro timer' }))
			.toBeVisible();
		await expect.element(page.getByText('A timer for focused work is on its way.')).toBeVisible();
	});
});
