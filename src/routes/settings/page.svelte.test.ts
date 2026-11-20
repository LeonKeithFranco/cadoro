import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { SettingsSession } from '#lib/settings.svelte.ts';
import { InMemoryStorage } from '#lib/storage/in-memory-storage.ts';
import type { PageProps } from './$types';
import SettingsPage from './+page.svelte';

describe('the Settings route', () => {
	it("shows the settings saved in the layout's settings session", async () => {
		// Only what the Settings page reads. The timer session is the Timer screen's, so it's left out.
		const settingsStorage = new InMemoryStorage();
		await settingsStorage.saveSettings({ theme: 'light' });
		const data = {
			settingsSession: new SettingsSession(settingsStorage, await settingsStorage.getSettings()),
			chimes: { preview: vi.fn() },
			wakeLockKeeper: { isSupported: true },
			storage: new InMemoryStorage()
		} as unknown as PageProps['data'];

		render(SettingsPage, { data, params: {} });

		await expect.element(page.getByRole('radio', { name: 'Light' })).toBeChecked();
		await expect.element(page.getByRole('radio', { name: 'Dark' })).not.toBeChecked();
	});
});
