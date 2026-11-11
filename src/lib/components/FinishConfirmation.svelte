<!--
  @component
  Asks the user to confirm Finish before the run ends. The run keeps counting while it's open, so
  Cancel and Escape leave the run exactly as it would have been.
-->
<script lang="ts">
	import { PRIMARY_BUTTON_COLOURS, SECONDARY_BUTTON_COLOURS } from './button-colours';
	import ModalDialog from './ModalDialog.svelte';

	/** The props the confirmation takes. */
	type Props = {
		/** Called when the user confirms, to end the run. */
		onconfirm: () => void;
		/** Called when the user changes their mind, with Cancel or Escape. */
		oncancel: () => void;
	};

	let { onconfirm, oncancel }: Props = $props();
</script>

<ModalDialog title="Finish this run?" onclose={oncancel}>
	<p class="mt-2 text-zinc-600 dark:text-zinc-400">This ends the run and shows its summary.</p>

	<!-- Cancel comes first, so the dialog opens with focus on it and a stray Enter doesn't end the
	     run. -->
	{#snippet actions()}
		<button type="button" onclick={oncancel} class={SECONDARY_BUTTON_COLOURS}>Cancel</button>
		<button type="button" onclick={onconfirm} class={PRIMARY_BUTTON_COLOURS}>Finish</button>
	{/snippet}
</ModalDialog>
