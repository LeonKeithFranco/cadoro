<!--
  @component
  The activity log, a page within Settings: every change to the routines and every import, and
  every error the app caught, newest first, each with its time, type and message and, when it has
  them, details to expand. It can be exported as a JSON file. Entries never leave the device
  except through that export.
-->
<script lang="ts">
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import { recordError } from '../error-log';
	import { exportFileName, serializeLog } from '../export-files';
	import type { SaveFile } from '../file-download';
	import { LOG_MAX_ENTRIES, type LogEntry } from '../log';
	import type { CadoroStorage } from '../storage/storage';
	import { BUTTON_SHAPE, SECONDARY_BUTTON_COLOURS } from './button-classes';
	import { ERROR_TEXT, LINK_TEXT } from './form-classes';
	import ScreenHeading from './ScreenHeading.svelte';

	/** The props the log page takes. */
	type Props = {
		/** Where the entries are read from. */
		storage: CadoroStorage;
		/** Hands the user a file to save. */
		saveFile: SaveFile;
		/** Returns the current moment, for the exported file's name. */
		now: () => Date;
	};

	let { storage, saveFile, now }: Props = $props();

	/** The entries, newest first, or `null` while they're being read. */
	let entries: LogEntry[] | null = $state(null);

	/** The words to show when the entries could not be read, or `null` when they could. */
	let failure: string | null = $state(null);

	/** How the time of each entry is written, in the user's own time zone. */
	const timeFormat = new Intl.DateTimeFormat(undefined, {
		dateStyle: 'medium',
		timeStyle: 'medium'
	});

	onMount(async () => {
		try {
			entries = await storage.getLogEntries();
		} catch (error) {
			void recordError('The activity log could not be read.', error);
			failure = 'The activity log could not be read.';
		}
	});

	/** Downloads the entries as a JSON file. */
	function exportLog(): void {
		if (entries === null) {
			return;
		}
		saveFile(exportFileName('log', now()), 'application/json', serializeLog(entries));
	}

	/**
	 * Writes an entry's details for the expanded view.
	 *
	 * @param details - The entry's details.
	 * @returns The details as indented JSON.
	 */
	function showDetails(details: Record<string, unknown>): string {
		return JSON.stringify(details, null, 2);
	}
</script>

<ScreenHeading title="Activity log" />

<p class="mt-2">
	<a href={resolve('/settings')} class={['inline-flex items-center gap-1', LINK_TEXT]}>
		<span aria-hidden="true">←</span>
		Back to Settings
	</a>
</p>

<section
	aria-labelledby="entries-heading"
	class="mt-4 rounded-xl border border-zinc-500 bg-white p-4 md:p-6 dark:border-zinc-500 dark:bg-zinc-900"
>
	<div class="flex flex-wrap items-center justify-between gap-3">
		<h2 id="entries-heading" class="font-semibold md:text-lg">Entries, newest first</h2>
		<button
			type="button"
			onclick={exportLog}
			disabled={entries === null}
			class={[BUTTON_SHAPE, SECONDARY_BUTTON_COLOURS]}
		>
			Export the log (JSON)
		</button>
	</div>
	<p class="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
		Changes to routines, imports and errors, kept on this device only. The newest {LOG_MAX_ENTRIES.toLocaleString(
			'en'
		)} are kept.
	</p>

	{#if failure !== null}
		<p role="alert" class={['mt-3', ERROR_TEXT]}>{failure}</p>
	{:else if entries === null}
		<p class="mt-3 text-zinc-600 dark:text-zinc-400">Reading the log…</p>
	{:else if entries.length === 0}
		<p class="mt-3 text-zinc-600 dark:text-zinc-400">Nothing has been logged yet.</p>
	{:else}
		<ul aria-label="Log entries" class="mt-3 divide-y divide-zinc-200 dark:divide-zinc-800">
			{#each entries as entry (entry.id)}
				<li class="py-3">
					<div class="flex flex-wrap items-center gap-x-3 gap-y-1">
						<time
							datetime={entry.timestamp}
							class="text-sm text-zinc-600 tabular-nums dark:text-zinc-400"
						>
							{timeFormat.format(new Date(entry.timestamp))}
						</time>
						<!-- The type is written out, so colour never carries the meaning alone. -->
						<span
							class={[
								'rounded-full border px-2 text-xs font-medium',
								entry.type === 'error'
									? ['border-rose-700 dark:border-rose-400', ERROR_TEXT]
									: 'border-zinc-500 text-zinc-700 dark:border-zinc-500 dark:text-zinc-300'
							]}
						>
							{entry.type === 'error' ? 'Error' : 'Change'}
						</span>
					</div>
					<p class="mt-1 break-words">{entry.message}</p>
					{#if entry.details !== undefined}
						<details class="mt-1">
							<summary class="cursor-pointer text-sm text-zinc-600 dark:text-zinc-400">
								Details
							</summary>
							<pre
								class="mt-1 overflow-x-auto rounded-md bg-zinc-100 p-2 text-xs dark:bg-zinc-800">{showDetails(
									entry.details
								)}</pre>
						</details>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</section>
