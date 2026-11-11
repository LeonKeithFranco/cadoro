import { page, userEvent } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import FinishConfirmation from './FinishConfirmation.svelte';

describe('the Finish confirmation', () => {
	it('asks whether to finish the run, and says what finishing does', async () => {
		render(FinishConfirmation, { onconfirm: vi.fn(), oncancel: vi.fn() });

		const dialog = page.getByRole('dialog', { name: 'Finish this run?' });
		await expect.element(dialog).toBeVisible();
		await expect
			.element(dialog.getByText('This ends the run and shows its summary.'))
			.toBeVisible();
	});

	it('opens with focus on Cancel, so a stray Enter keeps the run going', async () => {
		render(FinishConfirmation, { onconfirm: vi.fn(), oncancel: vi.fn() });

		await expect.element(page.getByRole('button', { name: 'Cancel' })).toHaveFocus();
	});

	it('reports Finish as confirming', async () => {
		const callbacks = { onconfirm: vi.fn(), oncancel: vi.fn() };
		render(FinishConfirmation, callbacks);

		await page.getByRole('button', { name: 'Finish' }).click();

		expect(callbacks.onconfirm).toHaveBeenCalledOnce();
		expect(callbacks.oncancel).not.toHaveBeenCalled();
	});

	it('reports Cancel as changing their mind', async () => {
		const callbacks = { onconfirm: vi.fn(), oncancel: vi.fn() };
		render(FinishConfirmation, callbacks);

		await page.getByRole('button', { name: 'Cancel' }).click();

		expect(callbacks.oncancel).toHaveBeenCalledOnce();
		expect(callbacks.onconfirm).not.toHaveBeenCalled();
	});

	it('reports Escape the same as Cancel', async () => {
		const callbacks = { onconfirm: vi.fn(), oncancel: vi.fn() };
		render(FinishConfirmation, callbacks);
		await expect.element(page.getByRole('dialog', { name: 'Finish this run?' })).toBeVisible();

		await userEvent.keyboard('{Escape}');

		await expect.poll(() => callbacks.oncancel).toHaveBeenCalledOnce();
		expect(callbacks.onconfirm).not.toHaveBeenCalled();
	});
});
