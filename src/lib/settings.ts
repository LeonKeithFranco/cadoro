// The user's settings from the spec's data model, with their defaults. Pure: nothing here reads
// storage or the page.

/** How the Routines screen orders the routines. */
export type RoutineSort =
	'custom' | 'title-asc' | 'title-desc' | 'last-used' | 'most-work' | 'newest' | 'oldest';

/** Which colours the app uses: a fixed theme, or the device's own choice. */
export type Theme = 'system' | 'light' | 'dark';

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
 * Both chimes default to the same one, as the spec says the break chime does. The spec names no
 * chime, so it's the first of the recordings in `static/chimes`.
 */
export const DEFAULT_SETTINGS: Settings = {
	theme: 'dark',
	volume: 70,
	targetChime: 'bell-ding-1',
	breakChime: 'bell-ding-1',
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
