import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CHIME_IDS, DEFAULT_CHIME, chimeFile, chimeFilesFor } from './chimes';

describe('CHIME_IDS', () => {
	it('lists every recording in static/chimes, and nothing else', () => {
		const recordings = readdirSync('static/chimes')
			.filter((name) => name.endsWith('.mp3'))
			.map((name) => name.replace(/\.mp3$/, ''));

		expect([...CHIME_IDS].sort()).toEqual(recordings.sort());
	});

	it('includes the default chime', () => {
		expect(CHIME_IDS).toContain(DEFAULT_CHIME);
	});
});

describe('chimeFile', () => {
	it('finds the file of a chime the app has', () => {
		expect(chimeFile('bell-ding-3')).toBe('chimes/bell-ding-3.mp3');
	});

	it('plays the default chime for an id the app doesn’t have', () => {
		expect(chimeFile('a-removed-chime')).toBe('chimes/bell-ding-1.mp3');
	});
});

describe('chimeFilesFor', () => {
	it('gives each alert the address of its own chime', () => {
		const files = chimeFilesFor(
			{ targetChime: 'bell-ding-2', breakChime: 'bell-ding-4' },
			(file) => `/cadoro/${file}`
		);

		expect(files).toEqual({
			target: '/cadoro/chimes/bell-ding-2.mp3',
			break: '/cadoro/chimes/bell-ding-4.mp3'
		});
	});
});
