import { describe, expect, it } from 'vitest';
import { exportFileName, serializeLog } from './export-files';

describe('exportFileName', () => {
	it('names the CSV of work periods with the day', () => {
		expect(exportFileName('csv', new Date(2026, 10, 19, 15, 30))).toBe(
			'cadoro-work-periods-2026-11-19.csv'
		);
	});

	it('names the JSON backup with the day', () => {
		expect(exportFileName('backup', new Date(2026, 10, 19, 15, 30))).toBe(
			'cadoro-backup-2026-11-19.json'
		);
	});

	it('names the log export with the day', () => {
		expect(exportFileName('log', new Date(2026, 10, 19, 15, 30))).toBe(
			'cadoro-activity-log-2026-11-19.json'
		);
	});

	it('pads a single-digit month and day with a zero', () => {
		expect(exportFileName('backup', new Date(2027, 0, 5))).toBe('cadoro-backup-2027-01-05.json');
	});

	it('uses the day in the local time zone, not in UTC', () => {
		const lateEvening = new Date(2026, 10, 19, 23, 59);

		expect(exportFileName('backup', lateEvening)).toBe('cadoro-backup-2026-11-19.json');
	});
});

describe('serializeLog', () => {
	it('writes the entries as indented JSON that reads back as the same entries', () => {
		const entries = [
			{
				id: 2,
				timestamp: '2026-11-19T10:00:00.000Z',
				type: 'error' as const,
				message: 'Failed.',
				details: { name: 'Error' }
			},
			{ id: 1, timestamp: '2026-11-19T09:00:00.000Z', type: 'change' as const, message: 'Edited' }
		];

		const text = serializeLog(entries);

		expect(text).toContain('\n  {');
		expect(JSON.parse(text)).toEqual(entries);
	});

	it('writes an empty log as an empty list', () => {
		expect(serializeLog([])).toBe('[]');
	});
});
