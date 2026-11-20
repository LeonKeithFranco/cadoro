<!--
  @component
  The Routines screen, listing, sorting and editing the routines, which the app's storage keeps.
  Its "last used" and "most work" orders read the app's one routine usage, as the Timer's picker does.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import RoutinesScreen from '#lib/components/RoutinesScreen.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// Runs made in another tab, or an import, may have changed the usage since it was last read.
	onMount(() => {
		void data.routineUsage.reload();
	});
</script>

<RoutinesScreen
	storage={data.storage}
	settingsSession={data.settingsSession}
	initialRoutines={data.timerSession.routines}
	runningRoutineId={data.timerSession.heldRoutineId}
	usage={data.routineUsage.usage}
/>
