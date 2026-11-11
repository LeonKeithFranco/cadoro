import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import TimerControls from './TimerControls.svelte';

/**
 * Makes the controls' callbacks as spies, so a test can check which one a button calls.
 *
 * @returns A spy for each of Play or Pause, Next and Finish.
 */
function createCallbacks() {
	return { onplaypause: vi.fn(), onnext: vi.fn(), onfinish: vi.fn() };
}

describe("the timer's controls", () => {
	it('offer only Play before the run starts', async () => {
		render(TimerControls, { isRunning: false, isInProgress: false, ...createCallbacks() });

		await expect.element(page.getByRole('button', { name: 'Play' })).toBeEnabled();
		await expect.element(page.getByRole('button', { name: 'Next' })).toBeDisabled();
		await expect.element(page.getByRole('button', { name: 'Finish' })).toBeDisabled();
	});

	it('show Pause in place of Play while a timer is counting', async () => {
		render(TimerControls, { isRunning: true, isInProgress: true, ...createCallbacks() });

		await expect.element(page.getByRole('button', { name: 'Pause' })).toBeEnabled();
		await expect.element(page.getByRole('button', { name: 'Play' })).not.toBeInTheDocument();
	});

	it('offer Play, Next and Finish while the run is paused', async () => {
		render(TimerControls, { isRunning: false, isInProgress: true, ...createCallbacks() });

		await expect.element(page.getByRole('button', { name: 'Play' })).toBeEnabled();
		await expect.element(page.getByRole('button', { name: 'Next' })).toBeEnabled();
		await expect.element(page.getByRole('button', { name: 'Finish' })).toBeEnabled();
	});

	it('report Play and Pause through the same callback', async () => {
		const callbacks = createCallbacks();
		render(TimerControls, { isRunning: false, isInProgress: false, ...callbacks });

		await page.getByRole('button', { name: 'Play' }).click();

		expect(callbacks.onplaypause).toHaveBeenCalledOnce();
		expect(callbacks.onnext).not.toHaveBeenCalled();
		expect(callbacks.onfinish).not.toHaveBeenCalled();
	});

	it('report Next', async () => {
		const callbacks = createCallbacks();
		render(TimerControls, { isRunning: true, isInProgress: true, ...callbacks });

		await page.getByRole('button', { name: 'Next' }).click();

		expect(callbacks.onnext).toHaveBeenCalledOnce();
		expect(callbacks.onplaypause).not.toHaveBeenCalled();
		expect(callbacks.onfinish).not.toHaveBeenCalled();
	});

	it('report Finish', async () => {
		const callbacks = createCallbacks();
		render(TimerControls, { isRunning: true, isInProgress: true, ...callbacks });

		await page.getByRole('button', { name: 'Finish' }).click();

		expect(callbacks.onfinish).toHaveBeenCalledOnce();
		expect(callbacks.onplaypause).not.toHaveBeenCalled();
		expect(callbacks.onnext).not.toHaveBeenCalled();
	});
});
