<!--
  @component
  The Timer screen, the app's home, showing the app's one timer session, which the root layout's
  `load` made. Its picker lists the routines in the order chosen on the Routines screen.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import TimerScreen from '#lib/components/TimerScreen.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// Runs made in another tab, or an import, may have changed the usage since it was last read.
	onMount(() => {
		void data.routineUsage.reload();
	});
</script>

<TimerScreen
	session={data.timerSession}
	routineSort={data.settingsSession.settings.routineSort}
	usage={data.routineUsage.usage}
/>
