<!--
  @component
  The Timer screen: the routine picker, where the run is in the routine, a card for each of the
  routine's blocks, and the buttons that run it. While a timer is counting, the screen updates
  every second. Leaving the screen pauses the run, so time spent on another screen isn't counted.
-->
<script module lang="ts">
	import { MS_PER_SECOND } from '../time';

	/** How often the screen updates while a timer is counting, in milliseconds. */
	const TICK_INTERVAL_MS = MS_PER_SECOND;
</script>

<script lang="ts">
	import { onDestroy } from 'svelte';
	import { viewBlock } from '../block-view';
	import type { TimerSession } from '../timer.svelte';
	import BlockCard from './BlockCard.svelte';
	import RoutinePicker from './RoutinePicker.svelte';
	import RunSummary from './RunSummary.svelte';
	import ScreenHeading from './ScreenHeading.svelte';
	import TimerControls from './TimerControls.svelte';

	/** The props the Timer screen takes. */
	type Props = {
		/** The session to show and control: the app's own, or one a test makes with a fake clock. */
		session: TimerSession;
	};

	let { session }: Props = $props();

	// An ended run has no position. The screen behind its summary shows no label until a new run
	// is ready.
	let positionLabel = $derived(session.view.status === 'ended' ? '' : session.view.label);

	// A derived value tells the effect below that it changed only when its value does. The view
	// changes on every tick, but this stays true, so the interval isn't restarted each second.
	let isRunning = $derived(session.view.isRunning);

	$effect(() => {
		if (!isRunning) {
			return;
		}
		const interval = setInterval(() => session.tick(), TICK_INTERVAL_MS);
		// Runs before the effect runs again and when the screen is removed, so a paused timer, or
		// one on another screen, stops ticking.
		return () => clearInterval(interval);
	});

	// SvelteKit removes the screen when another one opens, and the session outlives it.
	onDestroy(() => session.pause());

	/** Presses Play or Pause, whichever the button shows. */
	function playOrPause(): void {
		if (isRunning) {
			session.pause();
		} else {
			session.play();
		}
	}
</script>

<ScreenHeading title="Timer" />

<div class="mt-4 grid gap-4">
	<!-- Wrapped in an arrow function, because a method passed on its own loses its `this`. -->
	<RoutinePicker
		routines={session.routines}
		selectedId={session.routine.id}
		disabled={session.view.isInProgress}
		onselect={(id) => session.select(id)}
	/>

	{#if positionLabel}
		<p class="font-medium text-zinc-700 dark:text-zinc-300">{positionLabel}</p>
	{/if}

	<!-- One column on every screen, so the blocks read top to bottom in the order the run goes
	     through them, as each card's work box leads down to its break box. -->
	<div class="grid gap-4">
		{#each session.routine.blocks as block, index (block.id)}
			<BlockCard block={viewBlock(block, index, session.view)} />
		{/each}
	</div>

	<TimerControls
		{isRunning}
		isInProgress={session.view.isInProgress}
		onplaypause={playOrPause}
		onnext={() => session.next()}
		onfinish={() => session.finish()}
	/>
</div>

<!-- Shown for as long as the run has ended, so it opens whenever a run ends, by Finish or by its
     last work period, and is still there after a trip to another screen. Closing it readies a new
     run, which removes it. -->
{#if session.view.status === 'ended'}
	<RunSummary
		routineTitle={session.routine.title}
		summary={session.view.summary}
		ondone={() => session.readyNewRun()}
	/>
{/if}
