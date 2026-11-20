<!--
  @component
  The Settings screen: the theme, the chime for each alert with a Preview button, the volume,
  whether to keep the screen awake, whether the browser keeps the app's storage persistent, the
  data card (exports, backup, import and the activity log's link), and the app's version. A change is saved as it's made, and shows in every open tab.
-->
<script module lang="ts">
	import { VOLUME_MAX, VOLUME_MIN, type Theme } from '../settings';

	/** The themes to choose from, with the words each shows. */
	const THEMES: readonly { readonly value: Theme; readonly label: string }[] = [
		{ value: 'system', label: 'System' },
		{ value: 'light', label: 'Light' },
		{ value: 'dark', label: 'Dark' }
	];
</script>

<script lang="ts">
	import Volume2 from '@lucide/svelte/icons/volume-2';
	import { onMount } from 'svelte';
	import { CHIME_IDS, chimeIdFor, chimeName } from '../chimes';
	import type { SettingsSession } from '../settings.svelte';
	import {
		isStoragePersistent,
		requestPersistentStorage,
		type PersistenceManager
	} from '../storage/persistence';
	import type { SaveFile } from '../file-download';
	import type { CadoroStorage } from '../storage/storage';
	import { BUTTON_SHAPE, SECONDARY_BUTTON_COLOURS } from './button-classes';
	import Card from './Card.svelte';
	import DataSection from './DataSection.svelte';
	import { CHOICE_COLOURS, INPUT_COLOURS, LABEL_TEXT } from './form-classes';
	import ScreenHeading from './ScreenHeading.svelte';

	/** The props the Settings screen takes. */
	type Props = {
		/** The settings to show and change. */
		settingsSession: SettingsSession;
		/** Plays a chime as a preview, as the run's chimes do. */
		chimes: { preview(chime: string): Promise<void> };
		/** Whether the browser can keep the screen on, as the wake lock keeper says. */
		isWakeLockSupported: boolean;
		/** The browser's storage manager, or `undefined` where there's none. */
		storageManager: PersistenceManager | undefined;
		/** Where the data is exported from and imported into, and the activity log is read. */
		storage: CadoroStorage;
		/** Hands the user a file to save. */
		saveFile: SaveFile;
		/** Returns the current moment, for the exported files' names and dates. */
		now: () => Date;
	};

	let {
		settingsSession,
		chimes,
		isWakeLockSupported,
		storageManager,
		storage,
		saveFile,
		now
	}: Props = $props();

	let settings = $derived(settingsSession.settings);

	/**
	 * The volume while the slider is being dragged, shown at once and saved when it's let go, or
	 * `null` when it isn't being dragged.
	 */
	let draggedVolume: number | null = $state(null);
	let shownVolume = $derived(draggedVolume ?? settings.volume);

	/**
	 * Whether the browser keeps storage persistent, or `null` while that's being found out or
	 * when the browser can't say.
	 */
	let isPersistent: boolean | null = $state(null);

	/** The words for whether storage is persistent: On, Off, or Unknown when that isn't known. */
	let persistenceStatus = $derived.by(() => {
		if (isPersistent === null) {
			return 'Unknown';
		}
		return isPersistent ? 'On' : 'Off';
	});

	/** Whether the browser was asked again and still didn't make storage persistent. */
	let wasDeclined = $state(false);

	onMount(async () => {
		isPersistent = await isStoragePersistent(storageManager);
	});

	/** Asks the browser for persistent storage, then shows its answer. */
	async function askAgain(): Promise<void> {
		await requestPersistentStorage(storageManager);
		isPersistent = await isStoragePersistent(storageManager);
		wasDeclined = isPersistent === false;
	}

	/**
	 * Saves the volume the slider was let go at.
	 *
	 * @param event - The slider's change event.
	 */
	function saveVolume(event: Event & { currentTarget: HTMLInputElement }): void {
		draggedVolume = null;
		void settingsSession.save({ volume: event.currentTarget.valueAsNumber });
	}

	const idPrefix = $props.id();

	/** The id of the volume slider, which its label and written value point to. */
	const volumeId = `${idPrefix}-volume`;
</script>

<ScreenHeading title="Settings" />

<div class="mt-4 grid gap-4">
	<!-- Each group of settings is a card like the Timer screen's, named by its heading. -->
	<Card title="Appearance">
		<fieldset class="mt-3">
			<legend class={LABEL_TEXT}>Theme</legend>
			<div class="mt-2 flex flex-wrap gap-x-6 gap-y-2">
				{#each THEMES as theme (theme.value)}
					<label class="flex items-center gap-2">
						<input
							type="radio"
							name="theme"
							value={theme.value}
							checked={settings.theme === theme.value}
							onchange={(): void => void settingsSession.save({ theme: theme.value })}
							class={CHOICE_COLOURS}
						/>
						{theme.label}
					</label>
				{/each}
			</div>
		</fieldset>
	</Card>

	<Card title="Alerts">
		<div class="mt-3 grid gap-4">
			{@render chimePicker(
				`${idPrefix}-target-chime`,
				'Work target chime',
				'Plays when a work period reaches its target',
				settings.targetChime,
				(chime) => settingsSession.save({ targetChime: chime })
			)}
			{@render chimePicker(
				`${idPrefix}-break-chime`,
				'Break chime',
				'Plays when a break reaches 0:00',
				settings.breakChime,
				(chime) => settingsSession.save({ breakChime: chime })
			)}

			<div>
				<div class="flex items-baseline justify-between gap-4">
					<label for={volumeId} class={LABEL_TEXT}>Volume</label>
					<output for={volumeId} class={[LABEL_TEXT, 'tabular-nums']}>
						{shownVolume}%
					</output>
				</div>
				<input
					id={volumeId}
					type="range"
					min={VOLUME_MIN}
					max={VOLUME_MAX}
					step="1"
					value={shownVolume}
					oninput={(event): void => {
						draggedVolume = event.currentTarget.valueAsNumber;
					}}
					onchange={saveVolume}
					class="mt-2 block w-full accent-rose-700 dark:accent-rose-400"
				/>
			</div>
		</div>
	</Card>

	<Card title="Screen">
		<label class="mt-3 flex items-center gap-2">
			<input
				type="checkbox"
				checked={isWakeLockSupported && settings.keepScreenAwake}
				disabled={!isWakeLockSupported}
				onchange={(event): void =>
					void settingsSession.save({ keepScreenAwake: event.currentTarget.checked })}
				class={[CHOICE_COLOURS, 'disabled:cursor-not-allowed disabled:opacity-60']}
			/>
			Keep the screen awake during a run
		</label>
		{#if !isWakeLockSupported}
			<p class="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
				This browser can't keep the screen awake, so the screen may turn off during a run.
			</p>
		{/if}
	</Card>

	<Card title="Storage">
		<div class="mt-3 flex flex-wrap items-center justify-between gap-3">
			<p aria-live="polite">
				<span class="text-zinc-600 dark:text-zinc-400">Persistent storage:</span>
				<span class="font-medium">{persistenceStatus}</span>
			</p>
			{#if isPersistent === false}
				<button type="button" onclick={askAgain} class={[BUTTON_SHAPE, SECONDARY_BUTTON_COLOURS]}>
					Ask again
				</button>
			{/if}
		</div>
		<p class="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
			{#if isPersistent === true}
				The browser won't delete Cadoro's data when it runs low on space.
			{:else if isPersistent === false && wasDeclined}
				The browser declined. It may agree once you've used or installed the app more.
			{:else if isPersistent === false}
				The browser may delete Cadoro's data when it runs low on space.
			{:else}
				This browser can't say whether it keeps Cadoro's data when it runs low on space.
			{/if}
			Clearing the site's data, uninstalling or changing devices still erases it.
		</p>
	</Card>

	<DataSection {storage} {saveFile} {now} />

	<p class="text-sm text-zinc-600 dark:text-zinc-400">Version {__APP_VERSION__}</p>
</div>

<!-- A labelled drop-down of the chimes with a Preview button beside it, drawn for each alert. -->
{#snippet chimePicker(
	id: string,
	label: string,
	hint: string,
	chosen: string,
	choose: (chime: string) => Promise<void>
)}
	<div>
		<label for={id} class={LABEL_TEXT}>{label}</label>
		<p id="{id}-hint" class="text-sm text-zinc-600 dark:text-zinc-400">{hint}</p>
		<div class="mt-1 flex gap-2">
			<!-- A chime the app no longer has is shown as the default one, which is what plays. -->
			<select
				{id}
				aria-describedby="{id}-hint"
				bind:value={(): string => chimeIdFor(chosen), (chime: string): void => void choose(chime)}
				class={['block min-w-0 flex-1', INPUT_COLOURS]}
			>
				{#each CHIME_IDS as chimeId (chimeId)}
					<option value={chimeId}>{chimeName(chimeId)}</option>
				{/each}
			</select>
			<!-- Named by the alert it previews, since the screen has one Preview button for each. -->
			<button
				type="button"
				onclick={(): void => void chimes.preview(chosen)}
				class={['flex items-center gap-2', BUTTON_SHAPE, SECONDARY_BUTTON_COLOURS]}
			>
				<Volume2 class="size-5" />
				Preview <span class="sr-only">{label.toLowerCase()}</span>
			</button>
		</div>
	</div>
{/snippet}
