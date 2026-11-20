import { page } from 'vitest/browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { useErrorLog } from '#lib/error-log.ts';
import { InMemoryStorage } from '#lib/storage/in-memory-storage.ts';
import ErrorBoundaryHarness from '#lib/testing/ErrorBoundaryHarness.svelte';

// Takes the log away again and puts back what a test spied on.
afterEach(() => {
	useErrorLog(null);
	vi.restoreAllMocks();
});

describe('the error boundary', () => {
	it('shows its content when nothing throws', async () => {
		render(ErrorBoundaryHarness, { shouldThrow: false });

		await expect.element(page.getByText('All is well')).toBeVisible();
		expect(page.getByRole('alert').query()).toBeNull();
	});

	it('shows a plain message and a Try again button when its content throws', async () => {
		useErrorLog(new InMemoryStorage());

		render(ErrorBoundaryHarness, { shouldThrow: true });

		await expect.element(page.getByRole('alert')).toBeVisible();
		await expect.element(page.getByRole('heading', { name: 'Something went wrong' })).toBeVisible();
		await expect.element(page.getByRole('button', { name: 'Try again' })).toBeVisible();
		expect(page.getByText('All is well').query()).toBeNull();
	});

	it('shows what the content threw, for a bug report', async () => {
		useErrorLog(new InMemoryStorage());

		render(ErrorBoundaryHarness, { shouldThrow: true });

		await expect.element(page.getByText('The screen broke')).toBeVisible();
	});

	it('records the error in the activity log', async () => {
		const storage = new InMemoryStorage();
		useErrorLog(storage);

		render(ErrorBoundaryHarness, { shouldThrow: true });

		await expect.poll(() => storage.getLogEntries()).toHaveLength(1);
		expect((await storage.getLogEntries())[0]).toMatchObject({
			type: 'error',
			message: 'A screen failed to show.',
			details: { name: 'Error', message: 'The screen broke' }
		});
	});

	it('shows the content again when Try again is pressed and it no longer throws', async () => {
		useErrorLog(new InMemoryStorage());
		render(ErrorBoundaryHarness, { shouldThrow: true });

		await page.getByRole('button', { name: 'Fix it' }).click();
		await page.getByRole('button', { name: 'Try again' }).click();

		await expect.element(page.getByText('All is well')).toBeVisible();
		expect(page.getByRole('alert').query()).toBeNull();
	});

	it('shows the content again, without Try again, once the reset key changes', async () => {
		useErrorLog(new InMemoryStorage());
		render(ErrorBoundaryHarness, { shouldThrow: true });
		await expect.element(page.getByRole('alert')).toBeVisible();

		await page.getByRole('button', { name: 'Fix it' }).click();
		await page.getByRole('button', { name: 'Go to another screen' }).click();

		await expect.element(page.getByText('All is well')).toBeVisible();
		expect(page.getByRole('alert').query()).toBeNull();
	});
});
