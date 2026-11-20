import { describe, expect, it } from 'vitest';
import {
	DEFAULT_SETTINGS,
	settingsDifferingFromDefaults,
	settingsFrom,
	settingsWithChanges
} from './settings';

describe('settingsWithChanges', () => {
	it('puts the changes on top of the saved row, keeping the rest of it', () => {
		expect(settingsWithChanges({ theme: 'light', volume: 20 }, { volume: 30 })).toEqual({
			theme: 'light',
			volume: 30
		});
	});

	it('starts a row when none is saved, holding only the changes', () => {
		expect(settingsWithChanges(null, { theme: 'system' })).toEqual({ theme: 'system' });
	});

	it('leaves out a change that is undefined, keeping the saved value', () => {
		expect(settingsWithChanges({ theme: 'light' }, { theme: undefined })).toEqual({
			theme: 'light'
		});
	});

	it('saves false and null as changes', () => {
		expect(settingsWithChanges(null, { keepScreenAwake: false, lastRoutineId: null })).toEqual({
			keepScreenAwake: false,
			lastRoutineId: null
		});
	});
});

describe('settingsDifferingFromDefaults', () => {
	it('returns only the settings that differ from their defaults', () => {
		expect(
			settingsDifferingFromDefaults({ ...DEFAULT_SETTINGS, theme: 'light', keepScreenAwake: false })
		).toEqual({ theme: 'light', keepScreenAwake: false });
	});

	it('returns nothing for the defaults', () => {
		expect(settingsDifferingFromDefaults(DEFAULT_SETTINGS)).toEqual({});
	});

	it('keeps a null that differs from a default', () => {
		expect(settingsDifferingFromDefaults({ ...DEFAULT_SETTINGS, lastRoutineId: 'a' })).toEqual({
			lastRoutineId: 'a'
		});
	});
});

describe('DEFAULT_SETTINGS', () => {
	it('holds the spec defaults: dark, volume 70, screen kept awake, custom sort, no last routine', () => {
		expect(DEFAULT_SETTINGS).toMatchObject({
			theme: 'dark',
			volume: 70,
			keepScreenAwake: true,
			routineSort: 'custom',
			lastRoutineId: null
		});
	});

	it('uses the same chime for both alerts', () => {
		expect(DEFAULT_SETTINGS.breakChime).toBe(DEFAULT_SETTINGS.targetChime);
	});
});

describe('settingsFrom', () => {
	it('returns the defaults when nothing is saved', () => {
		expect(settingsFrom(null)).toEqual(DEFAULT_SETTINGS);
	});

	it('keeps what is saved and fills in the fields the row is missing', () => {
		expect(settingsFrom({ theme: 'light', volume: 20 })).toEqual({
			...DEFAULT_SETTINGS,
			theme: 'light',
			volume: 20
		});
	});

	it('keeps a saved false and null rather than replacing them with the defaults', () => {
		const settings = settingsFrom({ keepScreenAwake: false, lastRoutineId: null, volume: 0 });

		expect(settings.keepScreenAwake).toBe(false);
		expect(settings.volume).toBe(0);
	});

	it('treats a field set to undefined as missing', () => {
		expect(settingsFrom({ theme: undefined }).theme).toBe('dark');
	});

	it('returns a copy, so changing it leaves the defaults alone', () => {
		const settings = settingsFrom(null);
		settings.volume = 1;

		expect(DEFAULT_SETTINGS.volume).toBe(70);
	});
});
