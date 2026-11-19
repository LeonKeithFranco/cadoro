<!--
  @component
  The Timer screen, the app's home, showing the app's one timer session, which the root layout's
  `load` made. Its picker lists the routines in the order chosen on the Routines screen.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import TimerScreen from '#lib/components/TimerScreen.svelte';
	import { recordError } from '#lib/error-log.ts';
	import type { RoutineUsage } from '#lib/routine-sort.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	/** The runs and work periods that the "last used" and "most work" orders read. */
	let usage = $state.raw<RoutineUsage>({ runs: [], workPeriods: [] });

	onMount(() => {
		Promise.all([data.storage.getRuns(), data.storage.getWorkPeriods()])
			.then(([runs, workPeriods]) => {
				usage = { runs, workPeriods };
			})
			.catch((error: unknown) => {
				void recordError('The runs could not be read, so the picker may be out of order.', error);
			});
	});
</script>

<TimerScreen
	session={data.timerSession}
	routineSort={data.settingsSession.settings.routineSort}
	{usage}
/>
