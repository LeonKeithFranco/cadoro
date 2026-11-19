// Which colours the app shows. Pure: it never reads the page.

import type { Theme } from './settings';

/** A theme the page can actually show, which `system` resolves to. */
export type ShownTheme = 'light' | 'dark';

/**
 * The page's background in each theme, Tailwind's `white` and `zinc-950` as `app.html`'s body has
 * them, which the `theme-color` meta gives the browser's own bars so they match the page.
 *
 * @remarks
 * `src/app.html`'s inline script sets the same colours before the app loads, so a change here
 * needs the same change there.
 */
export const THEME_COLOURS: Readonly<Record<ShownTheme, string>> = {
	light: '#ffffff',
	dark: '#09090b'
};

/**
 * Works out the theme to show.
 *
 * @remarks
 * `src/app.html`'s inline script makes the same choice before the app loads, from the mirror of
 * the theme setting, so a change to the rule here needs the same change there.
 *
 * @param theme - The theme setting.
 * @param systemPrefersDark - Whether the device is set to dark, as the `prefers-color-scheme`
 * media query says. Only `system` uses it.
 * @returns `light` or `dark`: the setting itself when it names one, else the device's choice.
 */
export function resolveTheme(theme: Theme, systemPrefersDark: boolean): ShownTheme {
	if (theme === 'system') {
		return systemPrefersDark ? 'dark' : 'light';
	}
	return theme;
}
