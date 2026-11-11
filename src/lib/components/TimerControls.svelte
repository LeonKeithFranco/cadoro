<!--
  @component
  The run's buttons: Play, which reads Pause while a timer is counting, then Next and Finish,
  which only work once the run has started.
-->
<script lang="ts">
	import Flag from '@lucide/svelte/icons/flag';
	import Pause from '@lucide/svelte/icons/pause';
	import Play from '@lucide/svelte/icons/play';
	import SkipForward from '@lucide/svelte/icons/skip-forward';

	/** The props the controls take. */
	type Props = {
		/** Whether a timer is counting, so the first button pauses rather than plays. */
		isRunning: boolean;
		/** Whether the run has started and not yet ended, so Next and Finish can be pressed. */
		isInProgress: boolean;
		/** Called when the user presses Play or Pause. The parent tells which from the run. */
		onplaypause: () => void;
		/** Called when the user presses Next. */
		onnext: () => void;
		/** Called when the user presses Finish. */
		onfinish: () => void;
	};

	let { isRunning, isInProgress, onplaypause, onnext, onfinish }: Props = $props();

	/** The colours of Next and Finish, outlined so Play stands out as the main button. */
	const SECONDARY_COLOURS =
		'border border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800';
</script>

<!-- The `*:` classes style every button alike. Disabled buttons fade and show a not-allowed
     cursor, so it's plain they can't be pressed yet. -->
<div
	class="grid grid-cols-3 gap-3 *:flex *:items-center *:justify-center *:gap-2 *:rounded-lg *:py-3 *:font-medium *:disabled:cursor-not-allowed *:disabled:opacity-60 md:*:text-lg"
>
	<button
		type="button"
		onclick={onplaypause}
		class="bg-rose-700 text-white hover:bg-rose-800 dark:bg-rose-400 dark:text-zinc-950 dark:hover:bg-rose-300"
	>
		{#if isRunning}
			<Pause class="size-5" />
			Pause
		{:else}
			<Play class="size-5" />
			Play
		{/if}
	</button>
	<button type="button" onclick={onnext} disabled={!isInProgress} class={SECONDARY_COLOURS}>
		<SkipForward class="size-5" />
		Next
	</button>
	<button type="button" onclick={onfinish} disabled={!isInProgress} class={SECONDARY_COLOURS}>
		<Flag class="size-5" />
		Finish
	</button>
</div>
