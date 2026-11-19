import { afterEach, describe, expect, it, vi } from 'vitest';
import { THEME_MIRROR_KEY, writeThemeMirror } from './theme-mirror';

describe('writeThemeMirror', () => {
	// Leaves no mirror or replaced method behind for the next test.
	afterEach(() => {
		vi.restoreAllMocks();
		localStorage.removeItem(THEME_MIRROR_KEY);
	});

	it('saves the theme under the key the page script reads', () => {
		writeThemeMirror('light');

		expect(localStorage.getItem('cadoro-theme')).toBe('light');
	});

	it('replaces the theme saved before', () => {
		writeThemeMirror('light');
		writeThemeMirror('system');

		expect(localStorage.getItem('cadoro-theme')).toBe('system');
	});

	it('does nothing when the browser blocks localStorage', () => {
		vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
			throw new DOMException('blocked', 'SecurityError');
		});

		expect(() => {
			writeThemeMirror('light');
		}).not.toThrow();
	});
});
