import { page } from 'vitest/browser';
import { createRawSnippet } from 'svelte';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Card from './Card.svelte';

/**
 * Makes a snippet that draws a paragraph.
 *
 * @param text - The paragraph's text.
 * @returns The snippet.
 */
function paragraph(text: string): ReturnType<typeof createRawSnippet> {
	return createRawSnippet(() => ({ render: () => `<p>${text}</p>` }));
}

describe('a card', () => {
	it('is a region named by its heading, holding its content', async () => {
		render(Card, { title: 'Appearance', children: paragraph('Pick a theme') });

		const region = page.getByRole('region', { name: 'Appearance' });
		await expect.element(region).toBeVisible();
		await expect
			.element(region.getByRole('heading', { level: 2, name: 'Appearance' }))
			.toBeVisible();
		await expect.element(region.getByText('Pick a theme')).toBeVisible();
	});

	it('shows the snippet beside its heading, inside the region', async () => {
		render(Card, {
			title: 'Entries',
			beside: paragraph('Beside it'),
			children: paragraph('Below it')
		});

		await expect
			.element(page.getByRole('region', { name: 'Entries' }).getByText('Beside it'))
			.toBeVisible();
	});

	it('gives two cards on one page their own names', async () => {
		render(Card, { title: 'First', children: paragraph('a') });
		render(Card, { title: 'Second', children: paragraph('b') });

		await expect.element(page.getByRole('region', { name: 'First' })).toBeVisible();
		await expect.element(page.getByRole('region', { name: 'Second' })).toBeVisible();
	});
});
