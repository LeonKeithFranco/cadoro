import { page } from 'vitest/browser';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { writable, type Writable } from 'svelte/store';
import { useRegisterSW, type RegisterSWOptions } from 'virtual:pwa-register/svelte';
import { reloadPage } from '#lib/page-reload.ts';
import UpdatePrompt from './UpdatePrompt.svelte';

// The dev server's plugin registers no service worker, so nothing would ever wait. The plugin's
// helper is replaced with a fake whose store the tests set, as the real one does when a new
// version is found.
vi.mock('virtual:pwa-register/svelte', () => ({ useRegisterSW: vi.fn() }));
// A real reload would end the test, and the browser doesn't let `location.reload` be replaced.
vi.mock('#lib/page-reload.ts', () => ({ reloadPage: vi.fn() }));

/** What a test sees of the fake `useRegisterSW` once the prompt has called it. */
type FakeRegistration = {
	/** Whether a new version is waiting, which the test sets as the plugin would. */
	needRefresh: Writable<boolean>;
	/** Stands in for handing over to the waiting version. */
	updateServiceWorker: ReturnType<typeof vi.fn<() => Promise<void>>>;
	/** The options the prompt passed, such as its `onNeedReload`. */
	options: () => RegisterSWOptions | undefined;
};

/**
 * Makes `useRegisterSW` return real stores and a spy, keeping the options it was given.
 *
 * @returns The fake's store, spy and options, for the test to drive and check.
 */
function fakeRegistration(): FakeRegistration {
	const needRefresh = writable(false);
	const updateServiceWorker = vi.fn<() => Promise<void>>(() => Promise.resolve());
	let given: RegisterSWOptions | undefined;
	vi.mocked(useRegisterSW).mockImplementation((options) => {
		given = options;
		return { needRefresh, offlineReady: writable(false), updateServiceWorker };
	});
	return { needRefresh, updateServiceWorker, options: () => given };
}

/**
 * Plays the new version taking control, as the plugin does in every tab once Reload has been
 * pressed in any of them.
 *
 * @param registration - The fake the prompt registered with.
 */
function newVersionTakesControl(registration: FakeRegistration): void {
	registration.options()?.onNeedReload?.();
}

describe('the update prompt', () => {
	const card = page.getByRole('status').getByText('A new version is ready.');
	let registration: FakeRegistration;

	beforeEach(() => {
		vi.mocked(reloadPage).mockClear();
		registration = fakeRegistration();
	});

	it('shows nothing while no new version is waiting', async () => {
		render(UpdatePrompt, { runInProgress: false });

		await expect.element(page.getByRole('status')).toBeInTheDocument();
		await expect.element(card).not.toBeInTheDocument();
	});

	it('offers to reload once a new version is waiting', async () => {
		render(UpdatePrompt, { runInProgress: false });

		registration.needRefresh.set(true);

		await expect.element(card).toBeVisible();
		await expect.element(page.getByRole('button', { name: 'Reload' })).toBeVisible();
		await expect.element(page.getByRole('button', { name: 'Later' })).toBeVisible();
	});

	it('holds the offer back during a run, and makes it once the run ends', async () => {
		const prompt = render(UpdatePrompt, { runInProgress: true });
		registration.needRefresh.set(true);

		await expect.element(card).not.toBeInTheDocument();

		await prompt.rerender({ runInProgress: false });

		await expect.element(card).toBeVisible();
	});

	it('hands over to the new version on Reload', async () => {
		render(UpdatePrompt, { runInProgress: false });
		registration.needRefresh.set(true);

		await page.getByRole('button', { name: 'Reload' }).click();

		expect(registration.updateServiceWorker).toHaveBeenCalledOnce();
	});

	it('hides the offer on Later, without handing over', async () => {
		render(UpdatePrompt, { runInProgress: false });
		registration.needRefresh.set(true);

		await page.getByRole('button', { name: 'Later' }).click();

		await expect.element(card).not.toBeInTheDocument();
		expect(registration.updateServiceWorker).not.toHaveBeenCalled();
	});

	it('reloads once the new version takes control', async () => {
		render(UpdatePrompt, { runInProgress: false });

		newVersionTakesControl(registration);

		expect(reloadPage).toHaveBeenCalledOnce();
	});

	it('waits for the run to end when another tab hands over mid-run, then just reloads', async () => {
		const prompt = render(UpdatePrompt, { runInProgress: true });
		registration.needRefresh.set(true);

		newVersionTakesControl(registration);

		expect(reloadPage).not.toHaveBeenCalled();
		await expect.element(card).not.toBeInTheDocument();

		await prompt.rerender({ runInProgress: false });
		await page.getByRole('button', { name: 'Reload' }).click();

		expect(reloadPage).toHaveBeenCalledOnce();
		// No version is left waiting, so there's nothing to hand over to.
		expect(registration.updateServiceWorker).not.toHaveBeenCalled();
	});
});
