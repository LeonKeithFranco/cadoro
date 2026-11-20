<!--
  @component
  A routine in the Routines list: its title and a line about its rounds and blocks, with Edit,
  Duplicate and Delete. In custom order it also has a drag handle, Move up and Move down. Delete
  is off on the only routine left, with a line saying why.
-->
<script lang="ts">
	import ArrowDown from '@lucide/svelte/icons/arrow-down';
	import ArrowUp from '@lucide/svelte/icons/arrow-up';
	import Copy from '@lucide/svelte/icons/copy';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Trash from '@lucide/svelte/icons/trash';
	import { editButtonId, headingId } from '../routine-card-ids';
	import { describeRoutine, type Routine } from '../routine';
	import { CARD_CLASSES } from './card-classes';
	import CompactButton from './CompactButton.svelte';
	import DragHandle from './DragHandle.svelte';

	/** The props a routine's card takes. */
	type Props = {
		/** The routine to show. */
		routine: Routine;
		/** Whether the list is in custom order, which is when the card has Move up and Move down. */
		isInCustomOrder: boolean;
		/**
		 * Whether the card has a drag handle, which it only may in custom order, and only inside a
		 * drag-handle zone, which the list leaves while a routine is being edited.
		 */
		hasDragHandle: boolean;
		/** Whether the routine has one before it to move above. */
		canMoveUp: boolean;
		/** Whether the routine has one after it to move below. */
		canMoveDown: boolean;
		/** Whether the routine may be deleted, which it may unless it's the only one left. */
		canDelete: boolean;
		/**
		 * Whether the routine is the one a run in progress, in this tab or another, is running, which
		 * can't be edited or deleted until the run ends.
		 */
		isRunning: boolean;
		/** Called when the user presses Edit. */
		onedit: () => void;
		/** Called when the user presses Duplicate. */
		onduplicate: () => void;
		/** Called when the user presses Delete, which the screen confirms. */
		ondelete: () => void;
		/** Called when the user presses Move up. */
		onmoveup: () => void;
		/** Called when the user presses Move down. */
		onmovedown: () => void;
	};

	let {
		routine,
		isInCustomOrder,
		hasDragHandle,
		canMoveUp,
		canMoveDown,
		canDelete,
		isRunning,
		onedit,
		onduplicate,
		ondelete,
		onmoveup,
		onmovedown
	}: Props = $props();

	let description = $derived(describeRoutine(routine));
</script>

<div class={CARD_CLASSES}>
	<div class="flex items-start gap-3">
		{#if hasDragHandle}
			<DragHandle label="Drag {routine.title}" />
		{/if}
		<div class="min-w-0 flex-1">
			<!-- Focusable from script only, so the screen can put the focus here when Edit is disabled. -->
			<h2
				id={headingId(routine.id)}
				tabindex="-1"
				class="font-semibold wrap-break-word focus-visible:outline-2 focus-visible:outline-rose-700 md:text-lg dark:focus-visible:outline-rose-400"
			>
				{routine.title}
			</h2>
			<p class="text-sm text-zinc-600 md:text-base dark:text-zinc-400">
				{description}
			</p>
		</div>
	</div>

	<div class="mt-3 flex flex-wrap items-center gap-2">
		<CompactButton
			icon={Pencil}
			label="Edit"
			id={editButtonId(routine.id)}
			disabled={isRunning}
			onclick={onedit}
		/>
		<CompactButton icon={Copy} label="Duplicate" onclick={onduplicate} />
		<CompactButton
			icon={Trash}
			label="Delete"
			disabled={!canDelete || isRunning}
			onclick={ondelete}
		/>
		{#if isInCustomOrder}
			<CompactButton icon={ArrowUp} label="Move up" disabled={!canMoveUp} onclick={onmoveup} />
			<CompactButton
				icon={ArrowDown}
				label="Move down"
				disabled={!canMoveDown}
				onclick={onmovedown}
			/>
		{/if}
	</div>
	{#if isRunning}
		<p class="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
			This routine is running, so it can't be edited or deleted. Finish the run first.
		</p>
	{:else if !canDelete}
		<p class="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
			This is your only routine, so it can't be deleted. There is always one to run.
		</p>
	{/if}
</div>
