<!--
  @component
  The Stats screen, showing the routines and work periods that the page's `load` read from
  storage, as of the moment it opened.
-->
<script lang="ts">
	import StatsScreen from '#lib/components/StatsScreen.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<StatsScreen workPeriods={data.workPeriods} routines={data.routines} now={Date.now()} />
