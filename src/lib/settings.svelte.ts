// The settings as reactive state the screens read, kept in step with storage: a change made
// here is shown at once and saved, and one saved by another tab is followed.

import { recordError } from './error-log';
import { settingsFrom, settingsWithChanges, type Settings } from './settings';
import type { CadoroStorage } from './storage/storage';

/**
 * The user's settings, as state a component can read and change.
 *
 * @remarks
 * It follows storage's settings for as long as it lives, which is as long as the app is open,
 * so a change another tab saves shows here too.
 */
export class SettingsSession {
	/** Where the settings are saved and followed. */
	#storage: CadoroStorage;

	/**
	 * The settings as shown. `$state.raw`, since each change replaces the whole object rather than
	 * changing a field.
	 */
	#settings: Settings = $state.raw(settingsFrom(null));

	/**
	 * Starts following storage's settings.
	 *
	 * @param storage - Where the settings are saved and followed.
	 * @param initial - The settings as storage held them when the app opened, so the first render
	 * already has them.
	 */
	constructor(storage: CadoroStorage, initial: Settings) {
		this.#storage = storage;
		this.#settings = initial;
		storage.watchSettings(
			(settings) => {
				this.#settings = settings;
			},
			(error: unknown) => {
				void recordError('Following the settings failed.', error);
			}
		);
	}

	/** The settings as shown now. */
	get settings(): Settings {
		return this.#settings;
	}

	/**
	 * Changes some settings: they show at once, and are saved after.
	 *
	 * @remarks
	 * If the save fails, the error is logged and the settings go back to what storage holds,
	 * so the screen never shows a setting that isn't kept.
	 *
	 * @param changes - The settings to change, with their new values.
	 * @returns A promise that settles once the change is saved, or has been undone after failing.
	 * It never rejects.
	 */
	async save(changes: Partial<Settings>): Promise<void> {
		this.#settings = settingsFrom(settingsWithChanges(this.#settings, changes));
		try {
			await this.#storage.saveSettings(changes);
		} catch (error) {
			void recordError('Saving the settings failed.', error);
			try {
				this.#settings = await this.#storage.getSettings();
			} catch (readError) {
				void recordError('Reading the settings back failed.', readError);
			}
		}
	}
}
