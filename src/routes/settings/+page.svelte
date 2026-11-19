<!--
  @component
  The Settings screen, showing the app's settings session, chimes and wake lock, which the root
  layout's `load` made.
-->
<script lang="ts">
	import SettingsScreen from '#lib/components/SettingsScreen.svelte';
	import { downloadTextFile } from '#lib/file-download.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	/**
	 * The browser's storage manager, or `undefined` where there's none. TypeScript's DOM types say
	 * `navigator.storage` is always there, but it's missing outside HTTPS and `localhost`.
	 */
	const storageManager: StorageManager | undefined = navigator.storage;
</script>

<SettingsScreen
	settingsSession={data.settingsSession}
	chimes={data.chimes}
	isWakeLockSupported={data.wakeLockKeeper.isSupported}
	{storageManager}
	storage={data.storage}
	saveFile={downloadTextFile}
	now={(): Date => new Date()}
/>
