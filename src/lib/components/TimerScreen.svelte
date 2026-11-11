<!--
  @component
  The Timer screen: the routine picker, where the run is in the routine, and a card for each of
  the routine's blocks.
-->
<script lang="ts">
	import { viewBlock } from '../block-view';
	import type { TimerSession } from '../timer.svelte';
	import BlockCard from './BlockCard.svelte';
	import RoutinePicker from './RoutinePicker.svelte';
	import ScreenHeading from './ScreenHeading.svelte';

	/** The props the Timer screen takes. */
	type Props = {
		/** The session to show and control: the app's own, or one a test makes with a fake clock. */
		session: TimerSession;
	};

	let { session }: Props = $props();

	// An ended run has no position. Until the run summary exists, Finish goes straight to a new
	// ready run, so this screen never shows one.
	let positionLabel = $derived(session.view.status === 'ended' ? '' : session.view.label);
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
</div>
