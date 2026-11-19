import { afterEach, describe, expect, it, vi } from 'vitest';
import { useErrorLog } from './error-log';
import { DEFAULT_SETTINGS } from './settings';
import { SettingsSession } from './settings.svelte';
import { InMemoryStorage } from './storage/in-memory-storage';
import type { CadoroStorage } from './storage/storage';

describe('SettingsSession', () => {
	// Puts back any method a test replaced, and takes away the log a test chose for errors.
	afterEach(() => {
		useErrorLog(null);
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

	it('records a failed save in the activity log as an error entry', async () => {
		const storage = new InMemoryStorage();
		useErrorLog(storage);
		const session = new SettingsSession(storage, DEFAULT_SETTINGS);
		vi.spyOn(storage, 'saveSettings').mockRejectedValue(new Error('The disk is full.'));

		await session.save({ theme: 'system' });

		await expect.poll(() => storage.getLogEntries()).toHaveLength(1);
		expect((await storage.getLogEntries())[0]).toMatchObject({
			type: 'error',
			message: 'Saving the settings failed.',
			details: { message: 'The disk is full.' }
		});
	});

	it('records a failure to read the settings back in the activity log', async () => {
		const storage = new InMemoryStorage();
		useErrorLog(storage);
		const session = new SettingsSession(storage, DEFAULT_SETTINGS);
		vi.spyOn(storage, 'saveSettings').mockRejectedValue(new Error('The disk is full.'));
		vi.spyOn(storage, 'getSettings').mockRejectedValue(new Error('The disk is gone.'));

		await session.save({ theme: 'system' });

		await expect.poll(() => storage.getLogEntries()).toHaveLength(2);
		const entries = await storage.getLogEntries();
		expect(entries.map((entry) => entry.message)).toEqual([
			'Reading the settings back failed.',
			'Saving the settings failed.'
		]);
	});

	it('records in the activity log that the settings can no longer be followed', async () => {
		// Typed as the interface, which has the `onError` that `InMemoryStorage` leaves out.
		const storage: CadoroStorage = new InMemoryStorage();
		useErrorLog(storage);
		vi.spyOn(storage, 'watchSettings').mockImplementation((_onChange, onError) => {
			onError(new Error('The settings could not be read.'));
			return (): void => {};
		});

		new SettingsSession(storage, DEFAULT_SETTINGS);

		await expect.poll(() => storage.getLogEntries()).toHaveLength(1);
		expect((await storage.getLogEntries())[0]).toMatchObject({
			type: 'error',
			message: 'Following the settings failed.',
			details: { message: 'The settings could not be read.' }
		});
	});
});
