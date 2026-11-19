<!--
  @component
  The Stats screen, showing the routines and work periods that the page's `load` read from
  storage, and the work so far in the run in progress, which it follows, since another tab may be
  counting it. While a work period counts, the figures move on every second.
-->
<script lang="ts">
	import StatsScreen from '#lib/components/StatsScreen.svelte';
	import type { StoredRunInProgress } from '#lib/run-in-progress.ts';
	import { MS_PER_SECOND } from '#lib/time.ts';
	import { workInProgress } from '#lib/work-in-progress.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	/** The run in progress as last saved, in any tab. */
	let runInProgress = $state.raw<StoredRunInProgress | null>(null);
	/** The current moment, which moves on while a work period counts. */
	let now = $state(Date.now());

	// Starts from what `load` read, then follows storage, so a run another tab starts, pauses or
	// ends changes the figures.
	$effect(() => {
		runInProgress = data.runInProgress;
		now = Date.now();
		return data.storage.watchRunInProgress(
			(saved) => {
				runInProgress = saved;
				now = Date.now();
			},
			(error) => {
				console.error('Could not read the run in progress for Stats.', error);
			}
		);
	});

	/** Whether the run in progress is in a work period that's counting. */
	const isCounting = $derived(
		runInProgress?.run.status === 'working' && runInProgress.run.runningSince !== null
	);

	// Moves `now` on every second while a work period counts, so its work grows on the screen.
	$effect(() => {
		if (!isCounting) {
			return;
		}
		const interval = setInterval((): void => {
			now = Date.now();
		}, MS_PER_SECOND);
		return (): void => {
			clearInterval(interval);
		};
	});

	/** The work so far in the current work period, or `null`. */
	const current = $derived(workInProgress(runInProgress, data.routines, now));
</script>

<StatsScreen
	workPeriods={data.workPeriods}
	routines={data.routines}
	{now}
	workInProgress={current}
/>
