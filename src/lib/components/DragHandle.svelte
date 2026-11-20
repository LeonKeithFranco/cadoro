<!--
  @component
  The grip that drags an item of a drag-handle zone, such as a routine or a block. It's kept out of
  the Tab order, since Move up and Move down move items by keyboard.
-->
<script lang="ts">
	import GripVertical from '@lucide/svelte/icons/grip-vertical';
	import { dragHandle } from 'svelte-dnd-action';
	import { outOfTabOrder } from '../out-of-tab-order';

	/** The props a drag handle takes. */
	type Props = {
		/** The handle's accessible name, such as "Drag Focus", which says what it moves. */
		label: string;
	};

	let { label }: Props = $props();
</script>

<div
	use:dragHandle
	use:outOfTabOrder
	aria-label={label}
	class="rounded-lg p-1.5 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
>
	<GripVertical class="size-5" />
</div>
