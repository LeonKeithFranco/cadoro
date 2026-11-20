import { describe, expect, it } from 'vitest';
import { counted } from './plural';

describe('counted', () => {
	it('uses the singular for 1', () => {
		expect(counted(1, 'run')).toBe('1 run');
	});

	it('uses the plural for 0', () => {
		expect(counted(0, 'run')).toBe('0 runs');
	});

	it('uses the plural for more than 1', () => {
		expect(counted(3, 'work period')).toBe('3 work periods');
	});
});
