<!--
  @component
  The run summary: a dialog with the routine that was run and the run's totals, shown once a run
  ends. Done or Escape closes it.
-->
<script lang="ts">
	import type { RunSummary } from '../run';
	import { formatElapsed } from '../time';
	import ModalDialog from './ModalDialog.svelte';

	/** The props the run summary takes. */
	type Props = {
		/** The title of the routine that was run. */
		routineTitle: string;
		/** The ended run's totals. */
		summary: RunSummary;
		/** Called when the user closes the summary, with Done or Escape. */
		ondone: () => void;
	};

	let { routineTitle, summary, ondone }: Props = $props();
</script>

<!-- One row of the totals: its label on the left and its value on the right, as in the timer's
     boxes. -->
{#snippet total(label: string, value: string | number)}
	<div class="flex items-baseline justify-between gap-4">
		<dt class="text-zinc-600 dark:text-zinc-400">{label}</dt>
		<dd class="font-semibold tabular-nums">{value}</dd>
	</div>
{/snippet}

<ModalDialog title="Run summary" onclose={ondone}>
	<p class="text-zinc-600 dark:text-zinc-400">{routineTitle}</p>
	<dl class="mt-4 grid gap-2">
		{@render total('Total work time', formatElapsed(summary.totalWorkMs))}
		{@render total('Work periods completed', summary.periodsCompleted)}
		{@render total('Rounds reached', summary.roundsReached)}
		{@render total('Total overtime', formatElapsed(summary.overtimeMs))}
	</dl>
	<div class="mt-6 flex justify-end">
		<button
			type="button"
			onclick={ondone}
			class="rounded-lg bg-rose-700 px-6 py-2 font-medium text-white hover:bg-rose-800 dark:bg-rose-400 dark:text-zinc-950 dark:hover:bg-rose-300"
		>
			Done
		</button>
	</div>
</ModalDialog>
