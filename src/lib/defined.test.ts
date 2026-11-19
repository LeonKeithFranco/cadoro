import { describe, expect, it } from 'vitest';
import { requireDefined } from './defined';

describe('requireDefined', () => {
	it('returns a value that exists', () => {
		expect(requireDefined('a value', 'the value')).toBe('a value');
	});

	it('returns falsy values that exist, such as 0, an empty string and null', () => {
		expect(requireDefined(0, 'the number')).toBe(0);
		expect(requireDefined('', 'the text')).toBe('');
		expect(requireDefined(null, 'the null')).toBeNull();
	});

	it('throws, naming what was expected, when the value is undefined', () => {
		const items = ['first'];

		expect(() => requireDefined(items[1], 'the second item')).toThrow(
			'Expected the second item to exist, but it is missing.'
		);
	});
});
