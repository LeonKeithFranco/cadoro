<!--
  @component
  Puts a child that throws while it renders inside an `ErrorBoundary`, for the boundary's tests,
  with a button outside the boundary that makes the child stop throwing, as fixing the cause of an
  error would.
-->
<script lang="ts">
	import ErrorBoundary from '#lib/components/ErrorBoundary.svelte';

	/** The props the harness takes. */
	type Props = {
		/** Whether the child throws when it first renders. */
		shouldThrow: boolean;
	};

	let { shouldThrow }: Props = $props();

	/** Whether the button has fixed the cause. */
	let isFixed = $state(false);

	/** Whether the child still throws. */
	let isBroken = $derived(shouldThrow && !isFixed);

	/**
	 * Throws, as a component with a bug does while it renders.
	 *
	 * @throws {@link Error} Always.
	 */
	function explode(): never {
		throw new Error('The screen broke');
	}
</script>

<button
	type="button"
	onclick={(): void => {
		isFixed = true;
	}}>Fix it</button
>

<ErrorBoundary>
	{#if isBroken}
		{explode()}
	{:else}
		<p>All is well</p>
	{/if}
</ErrorBoundary>
