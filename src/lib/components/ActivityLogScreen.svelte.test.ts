import { page } from 'vitest/browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { useErrorLog } from '../error-log';
import type { SaveFile } from '../file-download';
import { InMemoryStorage } from '../storage/in-memory-storage';
import ActivityLogScreen from './ActivityLogScreen.svelte';

// Takes away the log a test chose for errors, and puts back what a test replaced.
afterEach(() => {
	useErrorLog(null);
	vi.restoreAllMocks();
});

/**
 * Renders the log page on storage.
 *
 * @param storage - The storage whose log is shown.
 * @returns The download spy.
 */
function renderLog(storage: InMemoryStorage): ReturnType<typeof vi.fn<SaveFile>> {
	const saveFile = vi.fn<SaveFile>();
	render(ActivityLogScreen, { storage, saveFile, now: () => new Date(2026, 10, 19, 15, 30) });
	return saveFile;
}

/**
 * Makes storage whose log holds a change, an error with details and a later change.
 *
 * @returns The storage.
 */
async function storageWithEntries(): Promise<InMemoryStorage> {
	const storage = new InMemoryStorage();
	await storage.addLogEntry({
		timestamp: '2026-11-19T09:00:00.000Z',
		type: 'change',
		message: 'Created routine "Writing"'
	});
	await storage.addLogEntry({
		timestamp: '2026-11-19T09:30:00.000Z',
		type: 'error',
		message: 'The run could not be saved.',
		details: { name: 'Error', message: 'The disk is full.' }
	});
	await storage.addLogEntry({
		timestamp: '2026-11-19T10:00:00.000Z',
		type: 'change',
		message: 'Imported a backup',
		details: { action: 'import', routines: 2 }
	});
	return storage;
}

describe('the activity log page', () => {
	it('is headed Activity log, and links back to Settings', async () => {
		renderLog(new InMemoryStorage());

		await expect
			.element(page.getByRole('heading', { level: 1, name: 'Activity log' }))
			.toBeVisible();
		await expect
			.element(page.getByRole('link', { name: 'Back to Settings' }))
			.toHaveAttribute('href', '/settings');
	});

	it('says nothing has been logged when the log is empty', async () => {
		renderLog(new InMemoryStorage());

		await expect.element(page.getByText('Nothing has been logged yet.')).toBeVisible();
	});

	it('lists the entries newest first, each with its message', async () => {
		renderLog(await storageWithEntries());

		const items = page.getByRole('list', { name: 'Log entries' }).getByRole('listitem');
		await expect.element(items).toHaveLength(3);
		await expect.element(items.nth(0)).toHaveTextContent('Imported a backup');
		await expect.element(items.nth(1)).toHaveTextContent('The run could not be saved.');
		await expect.element(items.nth(2)).toHaveTextContent('Created routine "Writing"');
	});

	it('writes each entry’s type in words, as Change or Error', async () => {
		renderLog(await storageWithEntries());

		const items = page.getByRole('list', { name: 'Log entries' }).getByRole('listitem');
		await expect.element(items.nth(0)).toHaveTextContent('Change');
		await expect.element(items.nth(1)).toHaveTextContent('Error');
	});

	it('marks each entry’s time with its UTC timestamp', async () => {
		renderLog(await storageWithEntries());

		const times = page.getByRole('list', { name: 'Log entries' }).getByRole('time');
		await expect.element(times.nth(0)).toHaveAttribute('datetime', '2026-11-19T10:00:00.000Z');
		await expect.element(times.nth(2)).toHaveAttribute('datetime', '2026-11-19T09:00:00.000Z');
	});

	it('offers details only for an entry that has them, closed until opened', async () => {
		renderLog(await storageWithEntries());

		const items = page.getByRole('list', { name: 'Log entries' }).getByRole('listitem');
		await expect.element(items.nth(2).getByText('Details')).not.toBeInTheDocument();
		const errorDetails = items.nth(1).getByText('Details');
		await expect.element(items.nth(1).getByText('The disk is full.')).not.toBeVisible();

		await errorDetails.click();

		await expect.element(items.nth(1).getByText(/"message": "The disk is full\."/)).toBeVisible();
	});

	it('exports the entries as a JSON file named with the day', async () => {
		const saveFile = renderLog(await storageWithEntries());

		await page.getByRole('button', { name: 'Export the log (JSON)' }).click();

		expect(saveFile).toHaveBeenCalledOnce();
		const [name, type, text] = saveFile.mock.calls[0] ?? [];
		expect(name).toBe('cadoro-activity-log-2026-11-19.json');
		expect(type).toBe('application/json');
		const exported = JSON.parse(String(text)) as { message: string }[];
		expect(exported.map((entry) => entry.message)).toEqual([
			'Imported a backup',
			'The run could not be saved.',
			'Created routine "Writing"'
		]);
	});

	it('says the log could not be read, and records that, when storage fails', async () => {
		const storage = new InMemoryStorage();
		useErrorLog(storage);
		vi.spyOn(storage, 'getLogEntries').mockRejectedValue(new Error('The disk is gone.'));
		vi.spyOn(console, 'error').mockImplementation(() => {});

		renderLog(storage);

		await expect
			.element(page.getByRole('alert'))
			.toHaveTextContent('The activity log could not be read.');
		await expect
			.element(page.getByRole('button', { name: 'Export the log (JSON)' }))
			.toBeDisabled();
	});

	it('says how many entries are kept', async () => {
		renderLog(new InMemoryStorage());

		await expect.element(page.getByText(/The newest 5,000 are kept/)).toBeVisible();
	});
});
