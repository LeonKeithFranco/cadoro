<!--
  @component
  The form for one block of a routine being edited: its title, work target, break percentage and
  cycles, with its drag handle, Move up, Move down, Duplicate and Delete. It sits inside a
  drag-handle zone, which the routine form provides. A routine with one block can't change its
  cycles, which stay 1, because its rounds repeat the block.
-->
<script lang="ts">
	import ArrowDown from '@lucide/svelte/icons/arrow-down';
	import ArrowUp from '@lucide/svelte/icons/arrow-up';
	import Copy from '@lucide/svelte/icons/copy';
	import GripVertical from '@lucide/svelte/icons/grip-vertical';
	import Trash from '@lucide/svelte/icons/trash';
	import { dragHandle } from 'svelte-dnd-action';
	import { outOfTabOrder } from '../out-of-tab-order';
	import type { Block } from '../routine';
	import type { BlockProblems } from '../routine-validation';
	import { COMPACT_BUTTON_SHAPE, SECONDARY_BUTTON_COLOURS } from './button-colours';
	import FormField from './FormField.svelte';

	/** The props a block's form takes. */
	type Props = {
		/** The block as it stands in the form. */
		block: Block;
		/** The block's place in the run order, counting from 1, which names its group. */
		position: number;
		/** What's wrong with each of the block's fields. */
		problems: BlockProblems;
		/** Whether the block is the routine's only one, whose cycles stay 1. */
		isOnlyBlock: boolean;
		/** Whether a block may be added, which Duplicate needs too. */
		canDuplicate: boolean;
		/** Whether the block may be deleted, which it may unless it's the last. */
		canDelete: boolean;
		/** Whether the block has one before it to move above. */
		canMoveUp: boolean;
		/** Whether the block has one after it to move below. */
		canMoveDown: boolean;
		/** Called with the block as changed, as the user types. */
		onchange: (block: Block) => void;
		/** Called when the user presses Duplicate. */
		onduplicate: () => void;
		/** Called when the user presses Delete, which the parent confirms. */
		ondelete: () => void;
		/** Called when the user presses Move up. */
		onmoveup: () => void;
		/** Called when the user presses Move down. */
		onmovedown: () => void;
	};

	let {
		block,
		position,
		problems,
		isOnlyBlock,
		canDuplicate,
		canDelete,
		canMoveUp,
		canMoveDown,
		onchange,
		onduplicate,
		ondelete,
		onmoveup,
		onmovedown
	}: Props = $props();
</script>

<fieldset class="rounded-lg border border-zinc-500 p-3 dark:border-zinc-500">
	<legend class="px-1 text-sm font-semibold">Block {position}</legend>
	<div class="grid gap-3 md:grid-cols-3">
		<div class="md:col-span-3">
			<FormField
				label="Block title"
				type="text"
				value={block.title}
				problem={problems.title}
				oninput={(input: HTMLInputElement): void => onchange({ ...block, title: input.value })}
			/>
		</div>
		<FormField
			label="Target (minutes)"
			type="number"
			value={block.targetMinutes}
			problem={problems.targetMinutes}
			oninput={(input: HTMLInputElement): void =>
				onchange({ ...block, targetMinutes: input.valueAsNumber })}
		/>
		<FormField
			label="Break (% of work)"
			type="number"
			value={block.breakPercent}
			problem={problems.breakPercent}
			oninput={(input: HTMLInputElement): void =>
				onchange({ ...block, breakPercent: input.valueAsNumber })}
		/>
		<FormField
			label="Cycles"
			type="number"
			value={block.cycles}
			problem={problems.cycles}
			hint={isOnlyBlock ? 'Rounds repeat a single block, so its cycles stay 1.' : undefined}
			disabled={isOnlyBlock}
			oninput={(input: HTMLInputElement): void =>
				onchange({ ...block, cycles: input.valueAsNumber })}
		/>
	</div>

	<!-- The handle comes first, as the row's leading control, and the buttons share one shape. -->
	<div class="mt-3 flex flex-wrap items-center gap-2">
		<div
			use:dragHandle
			use:outOfTabOrder
			aria-label="Drag block {position}"
			class="rounded-lg p-1.5 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
		>
			<GripVertical class="size-5" />
		</div>
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
		<button
			type="button"
			disabled={!canDuplicate}
			onclick={onduplicate}
			class="{COMPACT_BUTTON_SHAPE} {SECONDARY_BUTTON_COLOURS}"
		>
			<Copy class="size-4" />
			Duplicate
		</button>
		<button
			type="button"
			disabled={!canDelete}
			onclick={ondelete}
			class="{COMPACT_BUTTON_SHAPE} {SECONDARY_BUTTON_COLOURS}"
		>
			<Trash class="size-4" />
			Delete
		</button>
	</div>
	{#if !canDelete}
		<p class="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
			A routine needs at least one block, so this one can't be deleted.
		</p>
	{/if}
</fieldset>
