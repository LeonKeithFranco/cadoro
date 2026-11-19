import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { DEFAULT_SETTINGS } from '#lib/settings.ts';
import { SettingsSession } from '#lib/settings.svelte.ts';
import { InMemoryStorage } from '#lib/storage/in-memory-storage.ts';
import packageJson from '../../../package.json' with { type: 'json' };
import type { PageProps } from './$types';
import SettingsPage from './+page.svelte';

describe('the Settings screen', () => {
	it("shows the app's version from package.json", async () => {
		// Only what the Settings page reads. The timer session is the Timer screen's, so it's left out.
		const data = {
			settingsSession: new SettingsSession(new InMemoryStorage(), DEFAULT_SETTINGS),
			chimes: { preview: vi.fn() },
			wakeLockKeeper: { isSupported: true }
		} as unknown as PageProps['data'];

		render(SettingsPage, { data, params: {} });

		await expect.element(page.getByText(`Version ${packageJson.version}`)).toBeVisible();
	});
});
