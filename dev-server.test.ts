import { describe, expect, it } from 'vitest';
import { readDevPort } from './dev-server';

describe('readDevPort', () => {
	it("uses Vite's default port when PORT isn't set", () => {
		expect(readDevPort({})).toBe(5173);
	});

	it('uses the default port when PORT is empty', () => {
		expect(readDevPort({ PORT: '' })).toBe(5173);
	});

	it('uses PORT when it is set', () => {
		expect(readDevPort({ PORT: '5174' })).toBe(5174);
	});

	it.each(['abc', '51.5', '0', '65536', '-1'])('rejects a PORT of %s', (port) => {
		expect(() => readDevPort({ PORT: port })).toThrow(
			`PORT must be a whole number from 1 to 65535, but it's "${port}"`
		);
	});
});
