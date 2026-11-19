// A copy of the theme setting kept in `localStorage`, which the page can read at once, so the
// right theme shows before IndexedDB has answered. The storage backend owns it: `DexieStorage`
// writes it whenever it saves or reads the settings, and nothing else does. `src/app.html` reads
// it in a small inline script, since that runs before any module.

import type { Theme } from '../settings';

/**
 * The `localStorage` key the theme is mirrored under. `src/app.html`'s inline script reads the
 * same key, and saved data uses it, so it never changes.
 */
export const THEME_MIRROR_KEY = 'cadoro-theme';

/**
 * Copies the theme to `localStorage`, for the next page load to read.
 *
 * @remarks
 * The mirror is only a hint to avoid a flash, and IndexedDB stays the source of truth. So a
 * browser that blocks `localStorage`, as some private windows do, is left without it, and the
 * theme then shows once the settings have loaded.
 *
 * @param theme - The theme setting as saved.
 */
export function writeThemeMirror(theme: Theme): void {
	try {
		localStorage.setItem(THEME_MIRROR_KEY, theme);
	} catch {
		// Blocked or full: see the remarks.
	}
}
