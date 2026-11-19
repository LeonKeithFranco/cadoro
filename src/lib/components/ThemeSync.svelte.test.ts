import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import ThemeSync from './ThemeSync.svelte';

/** The device's light or dark setting as a test controls it. */
type FakeDevice = {
	/** Sets whether the device is dark, and tells the page, as the browser does when it changes. */
	setDark: (isDark: boolean) => void;
};

/**
 * Replaces `matchMedia` so the `prefers-color-scheme: dark` query answers as the test says.
 *
 * @param isDark - Whether the device starts out dark.
 * @returns The way to change the device's setting.
 */
function fakeDevice(isDark: boolean): FakeDevice {
	const query = new EventTarget() as MediaQueryList;
	let dark = isDark;
	Object.defineProperty(query, 'matches', { get: () => dark });
	vi.spyOn(window, 'matchMedia').mockReturnValue(query);
	return {
		setDark: (next: boolean): void => {
			dark = next;
			query.dispatchEvent(new Event('change'));
		}
	};
}

describe('ThemeSync', () => {
	// Puts back `matchMedia` and clears the theme the test set on the page.
	afterEach(() => {
		vi.restoreAllMocks();
		delete document.documentElement.dataset.theme;
	});

	it('sets data-theme to dark for the dark theme', async () => {
		fakeDevice(false);

		render(ThemeSync, { theme: 'dark' });

		await expect.poll(() => document.documentElement.dataset.theme).toBe('dark');
	});

	it('sets data-theme to light for the light theme, even on a dark device', async () => {
		fakeDevice(true);

		render(ThemeSync, { theme: 'light' });

		await expect.poll(() => document.documentElement.dataset.theme).toBe('light');
	});

	it('follows the device for system, and again when the device changes', async () => {
		const device = fakeDevice(true);
		render(ThemeSync, { theme: 'system' });
		await expect.poll(() => document.documentElement.dataset.theme).toBe('dark');

		device.setDark(false);

		await expect.poll(() => document.documentElement.dataset.theme).toBe('light');
	});

	it('changes data-theme when the theme setting changes', async () => {
		fakeDevice(false);
		const screen = render(ThemeSync, { theme: 'dark' });
		await expect.poll(() => document.documentElement.dataset.theme).toBe('dark');

		await screen.rerender({ theme: 'light' });

		await expect.poll(() => document.documentElement.dataset.theme).toBe('light');
	});

	it('ignores the device for a fixed theme', async () => {
		const device = fakeDevice(true);
		render(ThemeSync, { theme: 'dark' });
		await expect.poll(() => document.documentElement.dataset.theme).toBe('dark');

		device.setDark(false);

		await expect.poll(() => document.documentElement.dataset.theme).toBe('dark');
	});
});

describe('ThemeSync and the browser’s bars', () => {
	/** The page's `theme-color` meta, as `app.html` has it, dark to start with. */
	let themeColor: HTMLMetaElement;

	// Adds the `theme-color` meta `app.html` starts with, which the test page lacks.
	beforeEach(() => {
		themeColor = document.createElement('meta');
		themeColor.name = 'theme-color';
		themeColor.content = '#09090b';
		document.head.append(themeColor);
	});

	// Removes the meta and puts back `matchMedia`, and clears the theme the test set on the page.
	afterEach(() => {
		themeColor.remove();
		vi.restoreAllMocks();
		delete document.documentElement.dataset.theme;
	});

	it('colours the browser’s bars white for the light theme', async () => {
		fakeDevice(true);

		render(ThemeSync, { theme: 'light' });

		await expect.poll(() => themeColor.content).toBe('#ffffff');
	});

	it('keeps them the dark background for the dark theme', async () => {
		fakeDevice(false);
		const screen = render(ThemeSync, { theme: 'light' });
		await expect.poll(() => themeColor.content).toBe('#ffffff');

		await screen.rerender({ theme: 'dark' });

		await expect.poll(() => themeColor.content).toBe('#09090b');
	});

	it('follows the device for system', async () => {
		const device = fakeDevice(true);
		render(ThemeSync, { theme: 'system' });
		await expect.poll(() => themeColor.content).toBe('#09090b');

		device.setDark(false);

		await expect.poll(() => themeColor.content).toBe('#ffffff');
	});
});
