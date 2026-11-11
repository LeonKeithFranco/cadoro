<!--
  @component
  A labelled drop-down for choosing the routine to run, locked while a run is in progress.
-->
<script lang="ts">
	import type { Routine } from '../routine';

	/** The props the routine picker takes. */
	type Props = {
		/** The routines to pick from, in the order the drop-down lists them. */
		routines: readonly Routine[];
		/** The id of the chosen routine. */
		selectedId: string;
		/** Whether the picker is locked, as it is while a run is in progress. */
		disabled: boolean;
		/** Called with a routine's id when the user chooses it. */
		onselect: (id: string) => void;
	};

	let { routines, selectedId, disabled, onselect }: Props = $props();
</script>

<label class="block">
	<span class="text-sm font-medium text-zinc-700 dark:text-zinc-300">Routine</span>
	<!-- The binding reads the chosen id from the prop, and reports the user's choice to the
	     parent, which owns it, rather than changing the prop here. -->
	<select
		bind:value={() => selectedId, onselect}
		{disabled}
		class="mt-1 block w-full rounded-md border-zinc-300 bg-white text-zinc-900 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
	>
		{#each routines as routine (routine.id)}
			<option value={routine.id}>{routine.title}</option>
		{/each}
	</select>
</label>
