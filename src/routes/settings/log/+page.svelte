<!--
  @component
  The activity log, a page within Settings, reading the app's storage, which the root layout's
  `load` opened.
-->
<script lang="ts">
	import ActivityLogScreen from '#lib/components/ActivityLogScreen.svelte';
	import { downloadTextFile } from '#lib/file-download.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<ActivityLogScreen
	storage={data.storage}
	saveFile={downloadTextFile}
	now={(): Date => new Date()}
/>
