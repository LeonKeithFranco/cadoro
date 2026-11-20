<!--
  @component
  The frame every screen is drawn in. It loads the global styles, shows the header with the app's
  name and the navigation, keeps the theme in step with the setting, renders the current screen in the page's `<main>`, and holds the update
  prompt, which registers the service worker that keeps the app for offline use.
-->
<script lang="ts">
	import './layout.css';
	import { page } from '$app/state';
	import ErrorBoundary from '#lib/components/ErrorBoundary.svelte';
	import ScreenNav from '#lib/components/ScreenNav.svelte';
	import ThemeSync from '#lib/components/ThemeSync.svelte';
	import UpdatePrompt from '#lib/components/UpdatePrompt.svelte';
	import type { LayoutProps } from './$types';

	let { children, data }: LayoutProps = $props();
</script>

<ThemeSync theme={data.settingsSession.settings.theme} />

<!-- The header's border spans the window, while its contents line up with the screen below. -->
<header class="border-b border-zinc-200 dark:border-zinc-800">
	<div class="mx-auto flex max-w-3xl items-center px-4 py-3">
		<span class="font-semibold tracking-tight">Cadoro</span>
		<ScreenNav currentRoute={page.route.id} />
	</div>
</header>

<!-- On phones, the bottom padding keeps the end of the screen clear of the tab bar. -->
<main class="mx-auto max-w-3xl p-4 pb-24 md:pb-4">
	<ErrorBoundary resetKey={page.url.pathname}>
		{@render children()}
	</ErrorBoundary>
</main>

<!-- The layout mounts once, when the app opens, and stays while screens change, so the service
     worker is registered once. On the dev server the plugin makes registering do nothing, so
     development never runs an old cached copy. -->
<UpdatePrompt runInProgress={data.timerSession.view.isInProgress} />
