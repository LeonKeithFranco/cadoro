import { createRawSnippet } from 'svelte';
import { page, userEvent } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import ModalDialog from './ModalDialog.svelte';

/**
 * Content for the dialog to show under its heading.
 *
 * @remarks
 * A test can't write `{#snippet}` markup in a `.ts` file, so this builds the snippet from HTML. A
 * raw snippet must render exactly one root element.
 */
const content = createRawSnippet(() => ({ render: () => '<p>Some content</p>' }));

/**
 * Two buttons for the dialog's foot, as the Finish confirmation has.
 *
 * @remarks
 * The `<span>` is the single root a raw snippet needs.
 */
const actions = createRawSnippet(() => ({
	render: () => '<span><button>First</button><button>Second</button></span>'
}));

describe('a modal dialog', () => {
	it('opens as soon as it appears, named by its title, with its content', async () => {
		render(ModalDialog, { title: 'A dialog', onclose: vi.fn(), children: content, actions });

		const dialog = page.getByRole('dialog', { name: 'A dialog' });
		await expect.element(dialog).toBeVisible();
		await expect.element(dialog.getByRole('heading', { name: 'A dialog' })).toBeVisible();
		await expect.element(dialog.getByText('Some content')).toBeVisible();
	});

	it('opens as a modal, which keeps the page behind it out of use', async () => {
		render(ModalDialog, { title: 'A dialog', onclose: vi.fn(), children: content, actions });

		const dialog = page.getByRole('dialog', { name: 'A dialog' });
		await expect.element(dialog).toBeVisible();
		// Only a dialog opened with `showModal()` matches `:modal`, not one opened with `show()`.
		expect(dialog.element().matches(':modal')).toBe(true);
	});

	it('moves focus to its first button', async () => {
		render(ModalDialog, { title: 'A dialog', onclose: vi.fn(), children: content, actions });

		await expect.element(page.getByRole('button', { name: 'First' })).toHaveFocus();
	});

	it('reports Escape as closing it', async () => {
		const onclose = vi.fn();
		render(ModalDialog, { title: 'A dialog', onclose, children: content, actions });
		await expect.element(page.getByRole('dialog', { name: 'A dialog' })).toBeVisible();

		await userEvent.keyboard('{Escape}');

		await expect.poll(() => onclose).toHaveBeenCalledOnce();
	});
});
