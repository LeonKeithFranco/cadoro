<!--
  @component
  The frame every screen is drawn in. It loads the global styles and the favicon, then renders
  the current screen in the page's `<main>`.
-->
<script lang="ts">
	import './layout.css';
	import favicon from '#lib/assets/favicon.svg';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<main class="p-4">
	{@render children()}
</main>
