// The user's settings from the spec's data model, with their defaults. Pure: nothing here reads
// storage or the page.

import { DEFAULT_CHIME } from './chimes';
import type { RoutineSort } from './routine-sort';

/** Every theme the app has, which a backup's settings may hold. */
export const THEMES = ['system', 'light', 'dark'] as const;

/** Which colours the app uses: a fixed theme, or the device's own choice. */
export type Theme = (typeof THEMES)[number];

/** The fewest percent of volume. */
export const VOLUME_MIN = 0;

/** The most percent of volume. */
export const VOLUME_MAX = 100;

/** The user's settings, the spec's `Settings` type. */
export type Settings = {
	/** The colours the app uses. `system` follows the device's light or dark setting. */
	theme: Theme;
	/** How loud chimes play, from 0 (silent) to 100 (as recorded). */
	volume: number;
	/** The id of the chime played when a work period reaches its target. */
	targetChime: string;
	/** The id of the chime played when a break reaches 0:00. */
	breakChime: string;
	/** Whether to ask the browser to keep the screen on during a run. */
	keepScreenAwake: boolean;
	/** How the Routines screen orders the routines. */
	routineSort: RoutineSort;
	/** The id of the routine the last run used, or `null` before any run has started. */
	lastRoutineId: string | null;
};

/**
 * The settings of a user who has changed none, as the spec's data model gives them.
 *
 * @remarks
 * Both chimes default to the same one, as the spec says the break chime does: `DEFAULT_CHIME`,
 * the first of the recordings in `static/chimes`, since the spec names none.
 */
export const DEFAULT_SETTINGS: Settings = {
	theme: 'dark',
	volume: 70,
	targetChime: DEFAULT_CHIME,
	breakChime: DEFAULT_CHIME,
	keepScreenAwake: true,
	routineSort: 'custom',
	lastRoutineId: null
};

/**
 * Works out the settings row to save when some settings change: what was saved, with the
 * changes on top.
 *
 * @remarks
 * The row keeps only the settings the user has changed, so a default that a later version of the
 * app changes still reaches users who never touched that setting. A change that is `undefined`
 * is left out.
 *
 * @param saved - The row as saved, or `null` when none is.
 * @param changes - The settings to change, with their new values.
 * @returns The new row.
 */
export function settingsWithChanges(
	saved: Partial<Settings> | null,
	changes: Partial<Settings>
): Partial<Settings> {
	return { ...saved, ...withoutUndefined(changes) };
}

/**
 * Works out the settings row to save for a full set of settings, such as an import's: only the
 * settings that differ from today's defaults.
 *
 * @remarks
 * Storage keeps only changed settings, so a default that a later version changes still reaches
 * users who never touched that setting. A setting the backup holds at today's default counts as
 * untouched.
 *
 * @param settings - Every setting.
 * @returns The row holding only the settings that aren't at their default.
 */
export function settingsDifferingFromDefaults(settings: Settings): Partial<Settings> {
	const differing = Object.entries(settings).filter(
		([name, value]) => value !== DEFAULT_SETTINGS[name as keyof Settings]
	);
	return Object.fromEntries(differing);
}

/**
 * Drops the fields of a settings row that are `undefined`.
 *
 * @param row - A settings row.
 * @returns A copy with only the fields that hold a value.
 */
function withoutUndefined(row: Partial<Settings>): Partial<Settings> {
	const present = Object.entries(row).filter(([, value]) => value !== undefined);
	return Object.fromEntries(present);
}

/**
 * Fills in every setting a saved row doesn't hold, such as one added by a later version of the
 * app, with its default.
 *
 * @remarks
 * A field that is present but `undefined` counts as missing, so it can't wipe out a default.
 *
 * @param saved - The settings as saved, with any of them missing, or `null` when none are saved.
 * @returns A complete copy of the settings, which the caller may change freely.
 */
export function settingsFrom(saved: Partial<Settings> | null): Settings {
	return { ...DEFAULT_SETTINGS, ...withoutUndefined(saved ?? {}) };
}
