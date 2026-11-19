<!--
  @component
  Asks the user to confirm something before it happens, such as a deletion or throwing away
  changes. Cancel and Escape change nothing.
-->
<script lang="ts">
	import { PRIMARY_BUTTON_COLOURS, SECONDARY_BUTTON_COLOURS } from './button-colours';
	import ModalDialog from './ModalDialog.svelte';

	/** The props the confirmation takes. */
	type Props = {
		/** The question, which is also the dialog's name, such as "Delete Classic?". */
		title: string;
		/** What confirming does, or what is lost. */
		message: string;
		/** The confirming button's text, such as "Delete". */
		confirmLabel: string;
		/** Called when the user confirms. */
		onconfirm: () => void;
		/** Called when the user changes their mind, with Cancel or Escape. */
		oncancel: () => void;
	};

	let { title, message, confirmLabel, onconfirm, oncancel }: Props = $props();
</script>

<ModalDialog {title} onclose={oncancel}>
	<p class="mt-2 text-zinc-600 dark:text-zinc-400">{message}</p>

	<!-- Cancel comes first, so the dialog opens with focus on it and a stray Enter changes
	     nothing. -->
	{#snippet actions()}
		<button type="button" onclick={oncancel} class={SECONDARY_BUTTON_COLOURS}>Cancel</button>
		<button type="button" onclick={onconfirm} class={PRIMARY_BUTTON_COLOURS}>
			{confirmLabel}
		</button>
	{/snippet}
</ModalDialog>
