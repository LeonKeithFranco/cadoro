import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import ScreenHeading from './ScreenHeading.svelte';

describe("a screen's heading", () => {
	it("shows the screen's name as its main heading", async () => {
		render(ScreenHeading, { title: 'Routines' });

		await expect.element(page.getByRole('heading', { level: 1, name: 'Routines' })).toBeVisible();
	});

	it('names the browser tab after the screen and the app', async () => {
		render(ScreenHeading, { title: 'Routines' });

		await expect.poll(() => document.title).toBe('Routines · Cadoro');
	});
});
