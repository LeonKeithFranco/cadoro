<!--
  @component
  A native modal dialog that opens as soon as it appears, headed by its title. The page behind it
  can't be used until it closes, and Escape closes it. The parent shows it inside an `{#if}` and
  removes it to close it, so the dialog never has to be kept in step with an `open` flag.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { Attachment } from 'svelte/attachments';

	/** The props the dialog takes. */
	type Props = {
		/** The dialog's heading, which also names it for screen readers. */
		title: string;
		/** Called when the browser closes the dialog, as it does on Escape. */
		onclose: () => void;
		/** What the dialog shows under its heading, including its buttons. */
		children: Snippet;
	};

	let { title, onclose, children }: Props = $props();

	const titleId = $props.id();

	/**
	 * Opens the dialog as a modal once it's on the page.
	 *
	 * @remarks
	 * `showModal()` needs the element in the document, which an attachment guarantees, so it runs
	 * here rather than in the script. A modal dialog sits above the page, makes the rest of it
	 * inert and moves focus to its first button.
	 *
	 * @param dialog - The dialog element, just added to the page.
	 */
	const openAsModal: Attachment<HTMLDialogElement> = (dialog) => {
		dialog.showModal();
	};
</script>

<!-- Tailwind's base styles set every margin to 0, which takes away the browser's `margin: auto`
     that centres a modal dialog, so `m-auto` puts it back. The width leaves a 1rem gutter on each
     side of a phone's screen. -->
<dialog
	{@attach openAsModal}
	aria-labelledby={titleId}
	{onclose}
	class="m-auto w-[calc(100%-2rem)] max-w-sm rounded-xl border border-zinc-200 bg-white p-6 text-zinc-900 shadow-xl backdrop:bg-zinc-950/60 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
>
	<h2 id={titleId} class="text-lg font-semibold">{title}</h2>
	{@render children()}
</dialog>
