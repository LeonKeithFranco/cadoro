<!--
  @component
  The form a routine is edited in, in place in the Routines list: its title, its rounds, and a
  form for each block, which can be added, copied, deleted and reordered, with the buttons or by
  dragging the blocks' handles. Every field is checked against the data model's limits as the
  user types, each problem shows beside its field, and Save stays off until none is left.
  Deleting a block asks first. The form only reports changes, since the screen owns the draft.
-->
<script lang="ts">
	import Plus from '@lucide/svelte/icons/plus';
	import { dragHandleZone, type DndEvent } from 'svelte-dnd-action';
	import {
		addBlock,
		canAddBlock,
		canDeleteBlock,
		deleteBlock,
		duplicateBlock,
		moveBlockDown,
		moveBlockUp,
		resetSingleBlockCycles
	} from '../routine-blocks';
	import { BLOCKS_MAX } from '../routine-limits';
	import type { Block, Routine } from '../routine';
	import { isValid, validateRoutine } from '../routine-validation';
	import BlockEditor from './BlockEditor.svelte';
	import {
		COMPACT_BUTTON_SHAPE,
		PRIMARY_BUTTON_COLOURS,
		SECONDARY_BUTTON_COLOURS
	} from './button-colours';
	import ConfirmDialog from './ConfirmDialog.svelte';
	import FormField from './FormField.svelte';

	/** The props the routine form takes. */
	type Props = {
		/** The routine as it stands in the form, with the user's changes so far. */
		draft: Routine;
		/** Returns a new unique id each time it's called, such as `crypto.randomUUID`. */
		newId: () => string;
		/** What went wrong saving, shown above the buttons, or left out when nothing did. */
		saveError?: string | undefined;
		/**
		 * Why the routine can't be saved right now, such as a run of it having started in another
		 * tab, shown above the buttons while Save stays off. Left out when it can.
		 */
		lockedReason?: string | undefined;
		/** Called with the routine as changed, after each change the user makes. */
		onchange: (draft: Routine) => void;
		/** Called when the user presses Save, which is only possible while nothing is invalid. */
		onsave: () => void;
		/** Called when the user presses Cancel. */
		oncancel: () => void;
	};

	let { draft, newId, saveError, lockedReason, onchange, onsave, oncancel }: Props = $props();

	let problems = $derived(validateRoutine(draft));

	/**
	 * The blocks while one is being dragged, in the order the drag has them so far, or `null` the
	 * rest of the time. The routine itself changes only when the block is dropped.
	 */
	let draggedBlocks = $state.raw<Block[] | null>(null);

	/** The position of the block the user asked to delete, counting from 1, or `null`. */
	let blockToDelete = $state<number | null>(null);

	/**
	 * Reports a changed routine, applying the rule for a routine left with one block.
	 *
	 * @param changed - The routine as changed.
	 */
	function change(changed: Routine): void {
		onchange(resetSingleBlockCycles(changed));
	}

	/**
	 * Takes on the blocks as a drag has them.
	 *
	 * @param event - The drag-and-drop library's event, whose items are the blocks in the new order.
	 */
	function considerBlocks(event: CustomEvent<DndEvent<Block>>): void {
		draggedBlocks = event.detail.items;
	}

	/**
	 * Takes on the blocks as dropped.
	 *
	 * @param event - The drag-and-drop library's event, whose items are the blocks in the new order.
	 */
	function dropBlocks(event: CustomEvent<DndEvent<Block>>): void {
		draggedBlocks = null;
		change({ ...draft, blocks: event.detail.items });
	}

	/** Deletes the block the user confirmed deleting. */
	function confirmDeleteBlock(): void {
		const block = draft.blocks[(blockToDelete ?? 0) - 1];
		blockToDelete = null;
		if (block !== undefined && canDeleteBlock(draft)) {
			change(deleteBlock(draft, block.id));
		}
	}
</script>

<form
	aria-label="Edit routine"
	onsubmit={(event: SubmitEvent): void => {
		event.preventDefault();
		if (isValid(problems) && lockedReason === undefined) {
			onsave();
		}
	}}
	class="grid gap-4"
>
	<div class="grid gap-3 md:grid-cols-2">
		<FormField
			label="Title"
			type="text"
			value={draft.title}
			problem={problems.title}
			oninput={(input: HTMLInputElement): void => change({ ...draft, title: input.value })}
		/>
		<div class="grid gap-2">
			<FormField
				label="Rounds"
				type="number"
				value={draft.rounds === 'infinite' ? '' : draft.rounds}
				problem={problems.rounds}
				disabled={draft.rounds === 'infinite'}
				oninput={(input: HTMLInputElement): void =>
					change({ ...draft, rounds: input.valueAsNumber })}
			/>
			<label class="flex items-center gap-2 text-sm font-medium">
				<input
					type="checkbox"
					checked={draft.rounds === 'infinite'}
					onchange={(event: Event & { currentTarget: HTMLInputElement }): void =>
						change({ ...draft, rounds: event.currentTarget.checked ? 'infinite' : 1 })}
					class="rounded border-zinc-300 text-rose-700 dark:border-zinc-700 dark:bg-zinc-900"
				/>
				Repeat forever
			</label>
		</div>
	</div>

	<div class="grid gap-3">
		<!-- The zone and its handles are only here while editing, and the routine list has none
		     while a routine is open, since the library's handle zones share one state. -->
		<div
			use:dragHandleZone={{
				items: draggedBlocks ?? draft.blocks,
				flipDurationMs: 0,
				dropTargetStyle: {}
			}}
			onconsider={considerBlocks}
			onfinalize={dropBlocks}
			aria-label="Blocks"
			class="grid gap-3"
		>
			{#each draggedBlocks ?? draft.blocks as block, index (block.id)}
				<div aria-label="Block {index + 1}">
					<BlockEditor
						{block}
						position={index + 1}
						problems={problems.blockProblems[block.id] ?? {}}
						isOnlyBlock={draft.blocks.length === 1}
						canDuplicate={canAddBlock(draft)}
						canDelete={canDeleteBlock(draft)}
						canMoveUp={index > 0}
						canMoveDown={index < draft.blocks.length - 1}
						onchange={(changed: Block): void =>
							change({
								...draft,
								blocks: draft.blocks.map((existing: Block): Block =>
									existing.id === changed.id ? changed : existing
								)
							})}
						onduplicate={(): void => change(duplicateBlock(draft, block.id, newId))}
						ondelete={(): void => {
							blockToDelete = index + 1;
						}}
						onmoveup={(): void => change(moveBlockUp(draft, block.id))}
						onmovedown={(): void => change(moveBlockDown(draft, block.id))}
					/>
				</div>
			{/each}
		</div>
		{#if problems.blocks !== undefined}
			<p class="text-sm text-rose-700 dark:text-rose-400">{problems.blocks}</p>
		{/if}
		<div>
			<button
				type="button"
				disabled={!canAddBlock(draft)}
				onclick={(): void => change(addBlock(draft, newId))}
				class="{COMPACT_BUTTON_SHAPE} {SECONDARY_BUTTON_COLOURS}"
			>
				<Plus class="size-4" />
				Add block
			</button>
			{#if !canAddBlock(draft)}
				<p class="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
					A routine has at most {BLOCKS_MAX} blocks.
				</p>
			{/if}
		</div>
	</div>

	{#if lockedReason !== undefined}
		<p class="text-sm text-rose-700 dark:text-rose-400">{lockedReason}</p>
	{/if}
	{#if saveError !== undefined}
		<p role="alert" class="text-sm text-rose-700 dark:text-rose-400">{saveError}</p>
	{/if}

	<div class="flex justify-end gap-3 *:rounded-lg *:px-6 *:py-2 *:font-medium">
		<button type="button" onclick={oncancel} class={SECONDARY_BUTTON_COLOURS}>Cancel</button>
		<button
			type="submit"
			disabled={!isValid(problems) || lockedReason !== undefined}
			class="{PRIMARY_BUTTON_COLOURS} disabled:cursor-not-allowed disabled:opacity-60"
		>
			Save
		</button>
	</div>
</form>

{#if blockToDelete !== null}
	<ConfirmDialog
		title="Delete block {blockToDelete}?"
		message="The block is removed from the routine when you save."
		confirmLabel="Delete"
		onconfirm={confirmDeleteBlock}
		oncancel={(): void => {
			blockToDelete = null;
		}}
	/>
{/if}
