<!--
  @component
  Shows its content, unless something in it throws while rendering or in an effect. The error is
  recorded in the activity log, and the content is replaced by a message and a Try again button,
  which renders the content afresh, so one broken screen doesn't leave a blank page. Errors in
  event handlers, which Svelte's boundaries don't catch, reach the global handlers instead.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { recordError } from '#lib/error-log.ts';
	import { PRIMARY_BUTTON_COLOURS } from './button-colours';

	/** The props the boundary takes. */
	type Props = {
		/** What to show, such as the current screen. */
		children: Snippet;
		/**
		 * Anything that changes when the screen does, such as the page's path. A change shows the
		 * content afresh, so a screen that failed doesn't keep the next one from showing.
		 */
		resetKey: string;
	};

	let { children, resetKey }: Props = $props();

	/**
	 * Words what was thrown for the failed message.
	 *
	 * @param error - What the content threw, which needn't be an `Error`.
	 * @returns The error's message, or the thrown value as text.
	 */
	function messageOf(error: unknown): string {
		return error instanceof Error ? error.message : String(error);
	}
</script>

<!-- A new key builds the boundary afresh, so a failed screen isn't kept after the key changes. -->
{#key resetKey}
	<svelte:boundary
		onerror={(error: unknown): void => void recordError('A screen failed to show.', error)}
	>
		{@render children()}

		{#snippet failed(error: unknown, reset: () => void)}
			<div role="alert" class="rounded-lg border border-rose-700 p-4 dark:border-rose-400">
				<h1 class="text-xl font-semibold">Something went wrong</h1>
				<p class="mt-2 text-zinc-600 dark:text-zinc-400">
					This screen couldn't be shown. The error is in the activity log. Your saved data is
					untouched.
				</p>
				<p class="mt-2 font-mono text-sm text-zinc-600 dark:text-zinc-400">{messageOf(error)}</p>
				<button
					type="button"
					onclick={reset}
					class="mt-4 rounded-md px-4 py-2 {PRIMARY_BUTTON_COLOURS}"
				>
					Try again
				</button>
			</div>
		{/snippet}
	</svelte:boundary>
{/key}
