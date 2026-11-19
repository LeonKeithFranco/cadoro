import { page, userEvent } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import ConfirmDialog from './ConfirmDialog.svelte';

/**
 * Props for a confirmation of a deletion, with spies for its callbacks.
 *
 * @returns The props.
 */
function deletion(): {
	title: string;
	message: string;
	confirmLabel: string;
	onconfirm: () => void;
	oncancel: () => void;
} {
	return {
		title: 'Delete Classic?',
		message: 'Its work stays in the stats.',
		confirmLabel: 'Delete',
		onconfirm: vi.fn(),
		oncancel: vi.fn()
	};
}

describe('the confirmation dialog', () => {
	it('shows the question as its name, with the message', async () => {
		render(ConfirmDialog, deletion());

		const dialog = page.getByRole('dialog', { name: 'Delete Classic?' });
		await expect.element(dialog).toBeVisible();
		await expect.element(dialog.getByText('Its work stays in the stats.')).toBeVisible();
	});

	it('opens with focus on Cancel, so a stray Enter changes nothing', async () => {
		render(ConfirmDialog, deletion());

		await expect.element(page.getByRole('button', { name: 'Cancel' })).toHaveFocus();
	});

	it('reports the confirming button as confirming, under its own label', async () => {
		const props = deletion();
		render(ConfirmDialog, props);

		await page.getByRole('button', { name: 'Delete' }).click();

		expect(props.onconfirm).toHaveBeenCalledOnce();
		expect(props.oncancel).not.toHaveBeenCalled();
	});

	it('reports Cancel as changing their mind', async () => {
		const props = deletion();
		render(ConfirmDialog, props);

		await page.getByRole('button', { name: 'Cancel' }).click();

		expect(props.oncancel).toHaveBeenCalledOnce();
		expect(props.onconfirm).not.toHaveBeenCalled();
	});

	it('reports Escape the same as Cancel', async () => {
		const props = deletion();
		render(ConfirmDialog, props);
		await expect.element(page.getByRole('dialog', { name: 'Delete Classic?' })).toBeVisible();

		await userEvent.keyboard('{Escape}');

		await expect.poll(() => props.oncancel).toHaveBeenCalledOnce();
		expect(props.onconfirm).not.toHaveBeenCalled();
	});
});
