import { createRawSnippet } from 'svelte';
import { page, userEvent } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import ModalDialog from './ModalDialog.svelte';

/**
 * Content for the dialog to show: a line of text and two buttons, as the app's dialogs have.
 *
 * @remarks
 * A test can't write `{#snippet}` markup in a `.ts` file, so this builds the snippet from HTML. A
 * raw snippet must render exactly one root element, hence the wrapping `<div>`.
 */
const content = createRawSnippet(() => ({
	render: () => '<div><p>Some content</p><button>First</button><button>Second</button></div>'
}));

describe('a modal dialog', () => {
	it('opens as soon as it appears, named by its title, with its content', async () => {
		render(ModalDialog, { title: 'A dialog', onclose: vi.fn(), children: content });

		const dialog = page.getByRole('dialog', { name: 'A dialog' });
		await expect.element(dialog).toBeVisible();
		await expect.element(dialog.getByRole('heading', { name: 'A dialog' })).toBeVisible();
		await expect.element(dialog.getByText('Some content')).toBeVisible();
	});

	it('opens as a modal, which keeps the page behind it out of use', async () => {
		render(ModalDialog, { title: 'A dialog', onclose: vi.fn(), children: content });

		const dialog = page.getByRole('dialog', { name: 'A dialog' });
		await expect.element(dialog).toBeVisible();
		// Only a dialog opened with `showModal()` matches `:modal`, not one opened with `show()`.
		expect(dialog.element().matches(':modal')).toBe(true);
	});

	it('moves focus to its first button', async () => {
		render(ModalDialog, { title: 'A dialog', onclose: vi.fn(), children: content });

		await expect.element(page.getByRole('button', { name: 'First' })).toHaveFocus();
	});

	it('reports Escape as closing it', async () => {
		const onclose = vi.fn();
		render(ModalDialog, { title: 'A dialog', onclose, children: content });
		await expect.element(page.getByRole('dialog', { name: 'A dialog' })).toBeVisible();

		await userEvent.keyboard('{Escape}');

		await expect.poll(() => onclose).toHaveBeenCalledOnce();
	});
});
