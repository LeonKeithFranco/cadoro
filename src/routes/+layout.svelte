<!--
  @component
  The frame every screen is drawn in. It loads the global styles and the favicon, shows the
  header with the app's name and the navigation, then renders the current screen in the page's
  `<main>`.
-->
<script lang="ts">
	import './layout.css';
	import { page } from '$app/state';
	import favicon from '#lib/assets/favicon.svg';
	import ScreenNav from '#lib/components/ScreenNav.svelte';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<!-- The header's border spans the window, while its contents line up with the screen below. -->
<header class="border-b border-zinc-200 dark:border-zinc-800">
	<div class="mx-auto flex max-w-3xl items-center px-4 py-3">
		<span class="font-semibold tracking-tight">Cadoro</span>
		<ScreenNav currentRoute={page.route.id} />
	</div>
</header>

<!-- On phones, the bottom padding keeps the end of the screen clear of the tab bar. -->
<main class="mx-auto max-w-3xl p-4 pb-24 md:pb-4">
	{@render children()}
</main>
