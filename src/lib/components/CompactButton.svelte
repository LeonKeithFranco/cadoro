<!--
  @component
  A small outlined button with an icon before its label, such as Edit or Move up, for use inside
  a card. It takes any other attribute of a button, such as `disabled`, `id` and `onclick`.
-->
<script lang="ts">
	import type { Component } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';
	import { COMPACT_BUTTON_SHAPE, SECONDARY_BUTTON_COLOURS } from './button-classes';

	/** The props a compact button takes, besides the attributes of a button. */
	type Props = Omit<HTMLButtonAttributes, 'children' | 'class'> & {
		/** The icon drawn before the label, such as one from `@lucide/svelte`. */
		icon: Component<{ class?: string }>;
		/** The words on the button. */
		label: string;
	};

	let { icon: Icon, label, type = 'button', ...attributes }: Props = $props();
</script>

<button {type} {...attributes} class="{COMPACT_BUTTON_SHAPE} {SECONDARY_BUTTON_COLOURS}">
	<Icon class="size-4" />
	{label}
</button>
