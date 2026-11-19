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
	import GripVertical from '@lucide/svelte/icons/grip-vertical';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Trash from '@lucide/svelte/icons/trash';
	import { dragHandle } from 'svelte-dnd-action';
	import type { Routine } from '../routine';
	import { COMPACT_BUTTON_SHAPE, SECONDARY_BUTTON_COLOURS } from './button-colours';

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

	let blockCount = $derived(routine.blocks.length);
	let rounds = $derived(
		routine.rounds === 'infinite'
			? 'Repeats forever'
			: `${routine.rounds} ${routine.rounds === 1 ? 'round' : 'rounds'}`
	);
</script>

<div class="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
	<div class="flex items-start gap-3">
		{#if hasDragHandle}
			<div
				use:dragHandle
				aria-label="Drag {routine.title}"
				class="rounded-lg p-1.5 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
			>
				<GripVertical class="size-5" />
			</div>
		{/if}
		<div class="min-w-0 flex-1">
			<h2 class="font-semibold wrap-break-word md:text-lg">{routine.title}</h2>
			<p class="text-sm text-zinc-600 md:text-base dark:text-zinc-400">
				{rounds} · {blockCount}
				{blockCount === 1 ? 'block' : 'blocks'}
			</p>
		</div>
	</div>

	<div class="mt-3 flex flex-wrap items-center gap-2">
		<button
			type="button"
			disabled={isRunning}
			onclick={onedit}
			class="{COMPACT_BUTTON_SHAPE} {SECONDARY_BUTTON_COLOURS}"
		>
			<Pencil class="size-4" />
			Edit
		</button>
		<button
			type="button"
			onclick={onduplicate}
			class="{COMPACT_BUTTON_SHAPE} {SECONDARY_BUTTON_COLOURS}"
		>
			<Copy class="size-4" />
			Duplicate
		</button>
		<button
			type="button"
			disabled={!canDelete || isRunning}
			onclick={ondelete}
			class="{COMPACT_BUTTON_SHAPE} {SECONDARY_BUTTON_COLOURS}"
		>
			<Trash class="size-4" />
			Delete
		</button>
		{#if isInCustomOrder}
			<button
				type="button"
				disabled={!canMoveUp}
				onclick={onmoveup}
				class="{COMPACT_BUTTON_SHAPE} {SECONDARY_BUTTON_COLOURS}"
			>
				<ArrowUp class="size-4" />
				Move up
			</button>
			<button
				type="button"
				disabled={!canMoveDown}
				onclick={onmovedown}
				class="{COMPACT_BUTTON_SHAPE} {SECONDARY_BUTTON_COLOURS}"
			>
				<ArrowDown class="size-4" />
				Move down
			</button>
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
