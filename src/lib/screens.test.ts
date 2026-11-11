import { describe, expect, it } from 'vitest';
import { isCurrentScreen } from './screens';

describe('isCurrentScreen', () => {
	it.each([
		['/', '/'],
		['/routines', '/routines'],
		['/settings', '/settings']
	])('counts %s as current on its own route', (screenRoute, currentRoute) => {
		expect(isCurrentScreen(screenRoute, currentRoute)).toBe(true);
	});

	it('counts a screen as current on a route under it', () => {
		expect(isCurrentScreen('/settings', '/settings/activity')).toBe(true);
	});

	it.each([
		['/', '/routines'],
		['/', '/settings/activity'],
		['/routines', '/'],
		['/stats', '/settings']
	])('counts %s as not current on %s', (screenRoute, currentRoute) => {
		expect(isCurrentScreen(screenRoute, currentRoute)).toBe(false);
	});

	it('counts a screen as not current on a route that only starts with the same letters', () => {
		expect(isCurrentScreen('/stats', '/statsarchive')).toBe(false);
	});

	it('counts no screen as current when the URL matches no route', () => {
		expect(isCurrentScreen('/', null)).toBe(false);
	});
});
