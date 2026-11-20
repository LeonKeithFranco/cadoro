<!--
  @component
  The Settings screen's Data card: export the work periods as a CSV, back everything up as a JSON
  file, import a backup, and open the activity log. An import is read and checked first, then its
  summary is shown for the user to confirm, since it replaces all the data. A file that isn't a
  valid backup is turned away with the reason, and nothing changes.
-->
<script lang="ts">
	import { resolve } from '$app/paths';
	import { createBackup, serializeBackup, type Backup, type BackupData } from '../backup-format';
	import { parseBackup } from '../backup-parsing';
	import { describeBackupSummary, summarizeBackup, type BackupSummary } from '../backup-summary';
	import { workPeriodsToCsv } from '../csv-export';
	import { recordError } from '../error-log';
	import { exportFileName } from '../export-files';
	import { counted } from '../plural';
	import type { SaveFile } from '../file-download';
	import type { CadoroStorage } from '../storage/storage';
	import { BUTTON_SHAPE, SECONDARY_BUTTON_COLOURS } from './button-classes';
	import { ERROR_TEXT, LABEL_TEXT, LINK_TEXT } from './form-classes';
	import ConfirmDialog from './ConfirmDialog.svelte';

	/** The props the card takes. */
	type Props = {
		/** Where the data is read from, and where an import replaces it. */
		storage: CadoroStorage;
		/** Hands the user a file to save. */
		saveFile: SaveFile;
		/** Returns the current moment, for the exported files' names and dates. */
		now: () => Date;
	};

	let { storage, saveFile, now }: Props = $props();

	/** A valid backup the user chose, waiting for them to confirm replacing their data with it. */
	type PendingImport = {
		/** The checked backup. */
		backup: Backup;
		/** What it holds. */
		summary: BackupSummary;
	};

	/**
	 * Raw rather than deeply reactive, since storage copies what it's given, and a reactive proxy
	 * can't be copied.
	 */
	let pendingImport: PendingImport | null = $state.raw(null);

	/** What the last export or import has to say, shown under the buttons. */
	let notice: { kind: 'success' | 'failure'; text: string } | null = $state(null);

	const idPrefix = $props.id();

	/** The id of the file picker, which its label points to. */
	const fileInputId = `${idPrefix}-import`;

	/** The colours of a button in this card. */
	const buttonClasses = [BUTTON_SHAPE, SECONDARY_BUTTON_COLOURS];

	/**
	 * Reads the data and hands the user a file made from it, saying so if that fails.
	 *
	 * @param what - What is being exported, for the failure message, such as "The CSV export".
	 * @param makeFile - Makes the file from the data, and saves it.
	 */
	async function exportFile(what: string, makeFile: (data: BackupData) => void): Promise<void> {
		notice = null;
		try {
			makeFile(await storage.readBackupData());
		} catch (error) {
			void recordError(`${what} failed.`, error);
			notice = { kind: 'failure', text: `${what} failed. Try again.` };
		}
	}

	/** Downloads every work period as a CSV file. */
	async function exportCsv(): Promise<void> {
		await exportFile('The CSV export', (data) => {
			const moment = now();
			saveFile(
				exportFileName('csv', moment),
				'text/csv',
				workPeriodsToCsv(data.routines, data.workPeriods)
			);
		});
	}

	/** Downloads a backup of everything as a JSON file. */
	async function exportBackup(): Promise<void> {
		await exportFile('The backup', (data) => {
			const moment = now();
			saveFile(
				exportFileName('backup', moment),
				'application/json',
				serializeBackup(createBackup(data, moment))
			);
		});
	}

	/**
	 * Reads the file the user chose and checks it, then either shows why it can't be imported or
	 * asks them to confirm.
	 *
	 * @param event - The file picker's change event.
	 */
	async function chooseFile(event: Event & { currentTarget: HTMLInputElement }): Promise<void> {
		const input = event.currentTarget;
		const file = input.files?.[0];
		// Cleared at once, so choosing the same file again still counts as a change.
		input.value = '';
		if (file === undefined) {
			return;
		}

		notice = null;
		pendingImport = null;
		let text: string;
		try {
			text = await file.text();
		} catch (error) {
			void recordError('The backup file could not be read.', error);
			notice = { kind: 'failure', text: 'The file could not be read. Nothing was changed.' };
			return;
		}

		const result = parseBackup(text);
		if (!result.ok) {
			notice = {
				kind: 'failure',
				text: `This file can't be imported. ${result.message} Nothing was changed.`
			};
			return;
		}
		pendingImport = { backup: result.backup, summary: summarizeBackup(result.backup) };
	}

	/** Replaces all the data with the backup the user confirmed. */
	async function confirmImport(): Promise<void> {
		if (pendingImport === null) {
			return;
		}
		const { backup, summary } = pendingImport;
		pendingImport = null;
		try {
			await storage.replaceAllData(backup, summary);
			notice = {
				kind: 'success',
				text: `Imported ${counted(summary.routineCount, 'routine')}, ${counted(summary.runCount, 'run')} and ${counted(summary.workPeriodCount, 'work period')}.`
			};
		} catch (error) {
			void recordError('The import failed.', error);
			notice = { kind: 'failure', text: 'The import failed. Nothing was changed.' };
		}
	}
</script>

<section
	aria-labelledby="data-heading"
	class="rounded-xl border border-zinc-500 bg-white p-4 md:p-6 dark:border-zinc-500 dark:bg-zinc-900"
>
	<h2 id="data-heading" class="font-semibold md:text-lg">Data</h2>
	<p class="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
		Cadoro keeps its data in this browser only. A backup is the way to move it to another device, or
		to keep a copy.
	</p>

	<div class="mt-3 flex flex-wrap gap-2">
		<button type="button" onclick={exportCsv} class={buttonClasses}>
			Export work periods (CSV)
		</button>
		<button type="button" onclick={exportBackup} class={buttonClasses}>Back up (JSON)</button>
	</div>

	<div class="mt-4">
		<label for={fileInputId} class={LABEL_TEXT}> Import a backup </label>
		<p id="{fileInputId}-hint" class="text-sm text-zinc-600 dark:text-zinc-400">
			Replaces all the data here with a JSON backup's, once you confirm.
		</p>
		<input
			id={fileInputId}
			type="file"
			accept=".json,application/json"
			aria-describedby="{fileInputId}-hint"
			onchange={chooseFile}
			class="mt-2 block w-full text-sm text-zinc-700 file:mr-3 file:cursor-pointer file:rounded-lg file:border file:border-zinc-500 file:bg-white file:px-4 file:py-2 file:font-medium file:text-zinc-900 hover:file:bg-zinc-100 dark:text-zinc-300 dark:file:border-zinc-500 dark:file:bg-zinc-900 dark:file:text-zinc-100 dark:hover:file:bg-zinc-800"
		/>
	</div>

	{#if notice !== null}
		<p
			role={notice.kind === 'failure' ? 'alert' : 'status'}
			class={[
				'mt-3 text-sm',
				notice.kind === 'failure' ? ERROR_TEXT : 'text-zinc-700 dark:text-zinc-300'
			]}
		>
			{notice.text}
		</p>
	{/if}

	<p class="mt-4">
		<a href={resolve('/settings/log')} class={LINK_TEXT}> Activity log </a>
	</p>
</section>

{#if pendingImport !== null}
	<ConfirmDialog
		title="Replace all your data with this backup?"
		message="{describeBackupSummary(
			pendingImport.summary
		)} Importing replaces everything in Cadoro now, including a run in progress. This can't be undone."
		confirmLabel="Import"
		onconfirm={confirmImport}
		oncancel={(): void => {
			pendingImport = null;
		}}
	/>
{/if}
