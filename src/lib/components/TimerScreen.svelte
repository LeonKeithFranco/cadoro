<!--
  @component
  The Timer screen: the routine picker, where the run is in the routine, a card for each of the
  routine's blocks, and the buttons that run it. While a timer is counting, the screen updates
  every second, saving the run's heartbeat, which it also saves as the page is hidden or closed.
  Finish asks first, and a run that ends shows its summary. Leaving the screen pauses the run, so
  time spent on another screen isn't counted. A change from another tab shows as soon as the
  session takes it on.
-->
<script module lang="ts">
	import { MS_PER_SECOND } from '../time';

	/** How often the screen updates while a timer is counting, in milliseconds. */
	const TICK_INTERVAL_MS = MS_PER_SECOND;
</script>

<script lang="ts">
	import { onDestroy, tick } from 'svelte';
	import { viewBlock } from '../block-view';
	import { announcementFor } from '../run-announcement';
	import { sortRoutines, type RoutineSort, type RoutineUsage } from '../routine-sort';
	import type { TimerSession } from '../timer.svelte';
	import BlockCard from './BlockCard.svelte';
	import FinishConfirmation from './FinishConfirmation.svelte';
	import RoutinePicker from './RoutinePicker.svelte';
	import RunSummary from './RunSummary.svelte';
	import ScreenHeading from './ScreenHeading.svelte';
	import TimerControls from './TimerControls.svelte';

	/** The props the Timer screen takes. */
	type Props = {
		/** The session to show and control: the app's own, or one a test makes with a fake clock. */
		session: TimerSession;
		/** The order the picker lists the routines in, which the Routines screen's sort sets. */
		routineSort?: RoutineSort;
		/** The runs and work periods that the "last used" and "most work" orders read. */
		usage?: RoutineUsage;
	};

	let { session, routineSort = 'custom', usage = { runs: [], workPeriods: [] } }: Props = $props();

	let pickableRoutines = $derived(sortRoutines([...session.routines], routineSort, usage));

	/** The element holding the block cards, which the active block is scrolled into view in. */
	let blocksElement: HTMLElement | undefined = $state();

	// The block the run is in, or `null` once it has ended. Derived, so the effect below runs only
	// when the run moves to another block, not every second.
	let activeBlock = $derived(session.view.status === 'ended' ? null : session.view.block);

	$effect(() => {
		if (activeBlock === null) {
			return;
		}
		// `nearest` moves the page only when the block is out of view, so nothing moves while every
		// block fits. Each card's scroll margin clears the pinned controls.
		blocksElement?.children[activeBlock]?.scrollIntoView({ block: 'nearest' });
	});

	// What the live region says, which changes only as the run enters a phase worth announcing.
	let announcement = $derived(announcementFor(session.view));

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
		return (): void => clearInterval(interval);
	});

	// SvelteKit removes the screen when another one opens, and the session outlives it.
	onDestroy(() => session.pauseOnLeave());

	// Whether Finish is waiting for the user to confirm. It belongs to this screen rather than the
	// session, so leaving the screen drops the question, while the run itself is kept.
	let isConfirmingFinish = $state(false);

	// Derived, like `isRunning`, so the effect below runs again only when it changes.
	let isInProgress = $derived(session.view.isInProgress);

	// Another tab can end the run, or close its summary, while this one asks, so the question is
	// dropped then rather than asked again of the next run.
	$effect(() => {
		if (!isInProgress) {
			isConfirmingFinish = false;
		}
	});

	/** Ends the run once the user confirms Finish, at the moment they confirm. */
	function confirmFinish(): void {
		session.finish();
		isConfirmingFinish = false;
	}

	/** The Play and Pause button, which the focus returns to once the summary closes. */
	let playButton: HTMLButtonElement | undefined = $state();

	/**
	 * Closes the run's summary by readying a new run, and puts the focus on Play.
	 *
	 * @remarks
	 * The summary's dialog is removed as the run is readied, and the button that was focused
	 * before it, Finish, is off for a ready run, so the focus would otherwise fall to the page's
	 * body. Play is what the user presses next.
	 */
	function closeSummary(): void {
		session.readyNewRun();
		void tick().then(() => playButton?.focus());
	}

	/** Presses Play or Pause, whichever the button shows. */
	function playOrPause(): void {
		if (isRunning) {
			session.pause();
		} else {
			session.play();
		}
	}

	/**
	 * Saves the run's heartbeat as the page is hidden, such as when the user switches tabs or
	 * apps, or locks the phone. The browser may slow the page's timers or stop the app while it's
	 * hidden, so this keeps the moment a restored run is paused at as late as it can be.
	 */
	function saveHeartbeatIfHidden(): void {
		if (document.visibilityState === 'hidden') {
			session.tick();
		}
	}
</script>

<!-- `pagehide` fires as the page is closed, reloaded or left for another site, including into
     the browser's back-forward cache, where `unload` doesn't fire. -->
<svelte:document onvisibilitychange={saveHeartbeatIfHidden} />
<svelte:window onpagehide={(): void => session.tick()} />

<ScreenHeading title="Timer" />

<!-- A polite live region, so a screen reader hears of overtime, the break starting, the break
     being over and the run ending without the focus moving, and never in the middle of what it
     is reading. It's always in the page, since a region added with its text isn't announced. -->
<p role="status" aria-live="polite" class="sr-only">{announcement}</p>

<div class="mt-4 grid gap-4">
	<!-- Wrapped in an arrow function, because a method passed on its own loses its `this`. -->
	<RoutinePicker
		routines={pickableRoutines}
		selectedId={session.routine.id}
		disabled={session.view.isInProgress}
		onselect={(id: string): void => session.select(id)}
	/>

	{#if positionLabel}
		<p class="font-medium text-zinc-700 dark:text-zinc-300">{positionLabel}</p>
	{/if}

	<!-- One column on every screen, so the blocks read top to bottom in the order the run goes
	     through them, as each card's work box leads down to its break box. -->
	<div bind:this={blocksElement} class="grid gap-4">
		{#each session.routine.blocks as block, index (block.id)}
			<!-- The bottom scroll margin keeps a block that's scrolled into view clear of the pinned
			     controls, which are taller on phones, where they sit above the tab bar. -->
			<div class="scroll-mb-40 md:scroll-mb-28">
				<BlockCard block={viewBlock(block, index, session.view)} />
			</div>
		{/each}
	</div>

	<!-- Pinned to the bottom of the window with `sticky`, so a long routine never pushes them out
	     of reach, and in their place after the blocks when everything fits. On phones they sit
	     above the fixed tab bar, which is a little over 3.5rem tall. The box reaches down under the
	     tab bar, which sits above it, so no sliver of a block shows between them. The page's
	     background and a little padding keep the blocks scrolling under them from showing
	     through. -->
	<div
		class="sticky bottom-14 z-[5] -mx-4 bg-white px-4 pt-3 pb-6 md:bottom-0 md:pb-3 dark:bg-zinc-950"
	>
		<TimerControls
			bind:playButton
			{isRunning}
			isInProgress={session.view.isInProgress}
			onplaypause={playOrPause}
			onnext={(): void => session.next()}
			onfinish={(): void => {
				isConfirmingFinish = true;
			}}
		/>
	</div>
</div>

<!-- The run keeps counting behind the question, so Cancel changes nothing. -->
{#if isConfirmingFinish}
	<FinishConfirmation
		onconfirm={confirmFinish}
		oncancel={(): void => {
			isConfirmingFinish = false;
		}}
	/>
{/if}

<!-- Shown for as long as the run has ended, so it opens whenever a run ends, by Finish or by its
     last work period, and is still there after a trip to another screen. Closing it readies a new
     run, which removes it. -->
{#if session.view.status === 'ended'}
	<RunSummary
		routineTitle={session.routine.title}
		summary={session.view.summary}
		ondone={closeSummary}
	/>
{/if}
