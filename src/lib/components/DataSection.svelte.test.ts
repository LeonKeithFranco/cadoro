import { page } from 'vitest/browser';
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { createBackup, serializeBackup } from '../backup-format';
import { parseBackup } from '../backup-parsing';
import { useErrorLog } from '../error-log';
import type { SaveFile } from '../file-download';
import { DEFAULT_SETTINGS } from '../settings';
import { InMemoryStorage } from '../storage/in-memory-storage';
import { oneRoundRoutine, routineWith } from '../testing/routines';
import { savedRunInProgress } from '../testing/run-in-progress';
import { firstWorkPeriod, runWith } from '../testing/run-records';
import DataSection from './DataSection.svelte';

// Takes away the log a test chose for errors, and puts back what a test replaced.
afterEach(() => {
	useErrorLog(null);
	vi.restoreAllMocks();
});

/** What a test sets up and checks. */
type Setup = {
	/** The storage the card exports from and imports into. */
	storage: InMemoryStorage;
	/** A spy standing in for the browser's download. */
	saveFile: Mock<SaveFile>;
};

/**
 * Renders the card on storage that holds a routine, a run, a work period and a changed setting.
 *
 * @returns The storage and the download spy.
 */
async function renderCard(): Promise<Setup> {
	const storage = new InMemoryStorage();
	await storage.addRoutinesIfNone([oneRoundRoutine]);
	await storage.saveSettings({ volume: 30 });
	await storage.saveRunInProgress(savedRunInProgress, null, {
		run: runWith({
			endedAt: '2026-11-19T09:25:00.000Z',
			outcome: 'completed',
			roundsReached: 1
		}),
		workPeriods: [firstWorkPeriod]
	});
	const saveFile = vi.fn<SaveFile>();
	render(DataSection, { storage, saveFile, now: () => new Date(2026, 10, 19, 15, 30) });
	return { storage, saveFile };
}

/**
 * The text of a valid backup that holds two routines, one deleted, and a changed setting.
 *
 * @returns The file's text.
 */
function validBackupText(): string {
	const deleted = routineWith({
		id: 'old',
		title: 'Old plan',
		customPosition: 1,
		deletedAt: '2026-11-18T09:00:00.000Z'
	});
	return serializeBackup(
		createBackup(
			{
				routines: [oneRoundRoutine, deleted],
				runs: [
					runWith({
						id: 'run-1',
						endedAt: '2026-11-19T09:25:00.000Z',
						outcome: 'completed',
						roundsReached: 1
					})
				],
				workPeriods: [firstWorkPeriod],
				settings: { ...DEFAULT_SETTINGS, volume: 12 }
			},
			new Date('2026-11-20T10:00:00.000Z')
		)
	);
}

/**
 * Chooses a file in the import's file picker, as the user does.
 *
 * @param text - The file's contents.
 * @param name - The file's name.
 */
async function chooseFile(text: string, name = 'backup.json'): Promise<void> {
	const input = page.getByLabelText('Import a backup').element() as HTMLInputElement;
	const transfer = new DataTransfer();
	transfer.items.add(new File([text], name, { type: 'application/json' }));
	input.files = transfer.files;
	input.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('the Data card', () => {
	it('is a group headed Data with the exports, the import and a link to the activity log', async () => {
		await renderCard();

		const card = page.getByRole('region', { name: 'Data' });
		await expect
			.element(card.getByRole('button', { name: 'Export work periods (CSV)' }))
			.toBeVisible();
		await expect.element(card.getByRole('button', { name: 'Back up (JSON)' })).toBeVisible();
		await expect.element(card.getByLabelText('Import a backup')).toBeVisible();
		await expect
			.element(card.getByRole('link', { name: 'Activity log' }))
			.toHaveAttribute('href', '/settings/log');
	});

	describe('the CSV export', () => {
		it('downloads every work period with a header, named with the day', async () => {
			const { saveFile } = await renderCard();

			await page.getByRole('button', { name: 'Export work periods (CSV)' }).click();

			await expect.poll(() => saveFile.mock.calls).toHaveLength(1);
			expect(saveFile).toHaveBeenCalledWith(
				'cadoro-work-periods-2026-11-19.csv',
				'text/csv',
				'routine,block,started_at,ended_at,worked_seconds,target_minutes\r\n' +
					'One round,Focus,2026-11-19T09:00:00.000Z,2026-11-19T09:25:00.000Z,1500,25\r\n'
			);
		});

		it('says so, records the error and downloads nothing when the data cannot be read', async () => {
			const { storage, saveFile } = await renderCard();
			useErrorLog(storage);
			vi.spyOn(storage, 'readBackupData').mockRejectedValue(new Error('The disk is gone.'));

			await page.getByRole('button', { name: 'Export work periods (CSV)' }).click();

			await expect
				.element(page.getByRole('alert'))
				.toHaveTextContent('The CSV export failed. Try again.');
			expect(saveFile).not.toHaveBeenCalled();
			await expect.poll(() => storage.getLogEntries()).toHaveLength(1);
		});
	});

	describe('the JSON backup', () => {
		it('downloads everything as a backup the import accepts, named with the day', async () => {
			const { storage, saveFile } = await renderCard();

			await page.getByRole('button', { name: 'Back up (JSON)' }).click();

			await expect.poll(() => saveFile.mock.calls).toHaveLength(1);
			const [name, type, text] = saveFile.mock.calls[0] ?? [];
			expect(name).toBe('cadoro-backup-2026-11-19.json');
			expect(type).toBe('application/json');
			const parsed = parseBackup(String(text));
			expect(parsed.ok).toBe(true);
			if (parsed.ok) {
				const { routines, runs, workPeriods, settings } = await storage.readBackupData();
				expect(parsed.backup).toMatchObject({ routines, runs, workPeriods, settings });
			}
		});

		it('says so and downloads nothing when the data cannot be read', async () => {
			const { storage, saveFile } = await renderCard();
			vi.spyOn(storage, 'readBackupData').mockRejectedValue(new Error('The disk is gone.'));
			vi.spyOn(console, 'error').mockImplementation(() => {});

			await page.getByRole('button', { name: 'Back up (JSON)' }).click();

			await expect
				.element(page.getByRole('alert'))
				.toHaveTextContent('The backup failed. Try again.');
			expect(saveFile).not.toHaveBeenCalled();
		});
	});

	describe('importing a valid backup', () => {
		it('shows what the file holds and asks to confirm, changing nothing yet', async () => {
			const { storage } = await renderCard();
			const before = await storage.readBackupData();

			await chooseFile(validBackupText());

			const dialog = page.getByRole('dialog', { name: 'Replace all your data with this backup?' });
			await expect.element(dialog).toBeVisible();
			await expect
				.element(dialog)
				.toHaveTextContent(
					'The backup holds 2 routines, 1 run, 1 work period, with runs from 2026-11-19 to 2026-11-19, and was made on 2026-11-20.'
				);
			await expect.element(dialog).toHaveTextContent('including a run in progress');
			expect(await storage.readBackupData()).toEqual(before);
		});

		it('replaces all the data once confirmed, and says what was imported', async () => {
			const { storage } = await renderCard();
			await chooseFile(validBackupText());

			await page.getByRole('dialog').getByRole('button', { name: 'Import' }).click();

			await expect
				.element(page.getByRole('status'))
				.toHaveTextContent('Imported 2 routines, 1 run and 1 work period.');
			const data = await storage.readBackupData();
			expect(data.routines.map((routine) => routine.title)).toEqual(['One round', 'Old plan']);
			expect(data.settings.volume).toBe(12);
			expect(await storage.getRunInProgress()).toBeNull();
			expect(page.getByRole('dialog').query()).toBeNull();
		});

		it('forgets the run in progress that was there before the import, once confirmed', async () => {
			const { storage } = await renderCard();
			expect(await storage.getRunInProgress()).not.toBeNull();
			await chooseFile(validBackupText());

			await page.getByRole('dialog').getByRole('button', { name: 'Import' }).click();

			await expect
				.element(page.getByRole('status'))
				.toHaveTextContent('Imported 2 routines, 1 run and 1 work period.');
			expect(await storage.getRunInProgress()).toBeNull();
		});

		it('changes nothing when Cancel is pressed, and closes the dialog', async () => {
			const { storage } = await renderCard();
			const before = await storage.readBackupData();
			await chooseFile(validBackupText());

			await page.getByRole('button', { name: 'Cancel' }).click();

			expect(page.getByRole('dialog').query()).toBeNull();
			expect(await storage.readBackupData()).toEqual(before);
			expect(page.getByRole('status').query()).toBeNull();
		});

		it('records the error, says nothing was changed and closes the dialog when the import fails', async () => {
			const { storage } = await renderCard();
			useErrorLog(storage);
			vi.spyOn(storage, 'replaceAllData').mockRejectedValue(new Error('The disk is full.'));
			await chooseFile(validBackupText());

			await page.getByRole('dialog').getByRole('button', { name: 'Import' }).click();

			await expect
				.element(page.getByRole('alert'))
				.toHaveTextContent('The import failed. Nothing was changed.');
			expect(page.getByRole('dialog').query()).toBeNull();
			await expect.poll(() => storage.getLogEntries()).toHaveLength(1);
		});

		it('lets the same file be chosen again after cancelling', async () => {
			await renderCard();
			await chooseFile(validBackupText());
			await page.getByRole('button', { name: 'Cancel' }).click();

			await chooseFile(validBackupText());

			await expect.element(page.getByRole('dialog')).toBeVisible();
		});
	});

	describe('importing a file that is not a valid backup', () => {
		it('turns away a file that is not JSON, with the reason, and changes nothing', async () => {
			const { storage } = await renderCard();
			const before = await storage.readBackupData();

			await chooseFile('this is not json', 'notes.txt');

			await expect
				.element(page.getByRole('alert'))
				.toHaveTextContent(
					"This file can't be imported. This file is not valid JSON. Nothing was changed."
				);
			expect(page.getByRole('dialog').query()).toBeNull();
			expect(await storage.readBackupData()).toEqual(before);
		});

		it('turns away a backup from a newer version of the app', async () => {
			const { storage } = await renderCard();
			const before = await storage.readBackupData();
			const newer = JSON.stringify({ ...JSON.parse(validBackupText()), formatVersion: 2 });

			await chooseFile(newer);

			await expect.element(page.getByRole('alert')).toHaveTextContent('made by a newer version');
			expect(await storage.readBackupData()).toEqual(before);
		});

		it('turns away a backup with a broken reference, naming it', async () => {
			const { storage } = await renderCard();
			const before = await storage.readBackupData();
			const broken = JSON.stringify({
				...JSON.parse(validBackupText()),
				workPeriods: [{ ...firstWorkPeriod, runId: 'no-such-run' }]
			});

			await chooseFile(broken);

			await expect
				.element(page.getByRole('alert'))
				.toHaveTextContent('workPeriods[0] refers to the run "no-such-run"');
			expect(await storage.readBackupData()).toEqual(before);
		});

		it('clears the message once a valid file is chosen', async () => {
			await renderCard();
			await chooseFile('nope');
			await expect.element(page.getByRole('alert')).toBeVisible();

			await chooseFile(validBackupText());

			await expect.element(page.getByRole('dialog')).toBeVisible();
			expect(page.getByRole('alert').query()).toBeNull();
		});
	});
});
