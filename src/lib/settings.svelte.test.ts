import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from './settings';
import { SettingsSession } from './settings.svelte';
import { InMemoryStorage } from './storage/in-memory-storage';

describe('SettingsSession', () => {
	// Puts back any method a test replaced.
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('shows the settings it was opened with', () => {
		const session = new SettingsSession(new InMemoryStorage(), {
			...DEFAULT_SETTINGS,
			theme: 'light'
		});

		expect(session.settings.theme).toBe('light');
	});

	it('shows a change at once and saves it', async () => {
		const storage = new InMemoryStorage();
		const session = new SettingsSession(storage, DEFAULT_SETTINGS);

		const saving = session.save({ theme: 'system' });

		expect(session.settings.theme).toBe('system');
		await saving;
		expect((await storage.getSettings()).theme).toBe('system');
	});

	it('follows a change saved through the same storage, as another tab’s', async () => {
		const storage = new InMemoryStorage();
		const session = new SettingsSession(storage, DEFAULT_SETTINGS);

		await storage.saveSettings({ volume: 5 });

		await expect.poll(() => session.settings.volume).toBe(5);
	});

	it('keeps a setting when its change is undefined', async () => {
		const storage = new InMemoryStorage();
		await storage.saveSettings({ theme: 'light' });
		const session = new SettingsSession(storage, { ...DEFAULT_SETTINGS, theme: 'light' });

		await session.save({ theme: undefined });

		expect(session.settings.theme).toBe('light');
	});

	it('goes back to what storage holds, and logs the error, when a save fails', async () => {
		const storage = new InMemoryStorage();
		await storage.saveSettings({ theme: 'light' });
		const session = new SettingsSession(storage, { ...DEFAULT_SETTINGS, theme: 'light' });
		const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.spyOn(storage, 'saveSettings').mockRejectedValue(new Error('The disk is full.'));
		// Lets the session's first report from storage arrive, so only the undo can put the theme
		// back, not that report.
		await storage.getSettings();

		await session.save({ theme: 'system' });

		expect(session.settings.theme).toBe('light');
		expect(logged).toHaveBeenCalledOnce();
	});

	it('logs both errors, and doesn’t reject, when storage can’t be read back either', async () => {
		const storage = new InMemoryStorage();
		const session = new SettingsSession(storage, DEFAULT_SETTINGS);
		const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.spyOn(storage, 'saveSettings').mockRejectedValue(new Error('The disk is full.'));
		vi.spyOn(storage, 'getSettings').mockRejectedValue(new Error('The disk is gone.'));

		await session.save({ theme: 'system' });

		expect(logged).toHaveBeenCalledTimes(2);
	});
});
