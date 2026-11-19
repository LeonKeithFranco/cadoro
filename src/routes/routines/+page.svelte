<!--
  @component
  The Routines screen, listing, sorting and editing the routines, which the app's storage keeps.
-->
<script lang="ts">
	import RoutinesScreen from '#lib/components/RoutinesScreen.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<RoutinesScreen
	storage={data.storage}
	settingsSession={data.settingsSession}
	initialRoutines={data.timerSession.routines}
/>
