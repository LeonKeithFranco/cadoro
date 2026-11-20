<!--
  @component
  Puts a child that throws while it renders inside an `ErrorBoundary`, for the boundary's tests,
  with a button outside the boundary that makes the child stop throwing, as fixing the cause of an
  error would, and another that moves to a different screen, as navigating does.
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

	/** Which screen the boundary is showing, which the second button changes, as navigation does. */
	let screen = $state('first');

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

<button
	type="button"
	onclick={(): void => {
		screen = 'another';
	}}>Go to another screen</button
>

<ErrorBoundary resetKey={screen}>
	{#if isBroken}
		{explode()}
	{:else}
		<p>All is well</p>
	{/if}
</ErrorBoundary>
