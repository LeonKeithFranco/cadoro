<!--
  @component
  Keeps the page's theme in step with the theme setting. It draws nothing: it sets `data-theme` on
  `<html>`, which the `dark:` variant in `layout.css` follows. For `system` it follows the device's
  light or dark setting live, so the page changes when the device does.
-->
<script lang="ts">
	import { MediaQuery } from 'svelte/reactivity';
	import type { Theme } from '#lib/settings.ts';
	import { resolveTheme } from '#lib/theme.ts';

	/** Props for {@link ThemeSync}. */
	type Props = {
		/** The theme setting to show. */
		theme: Theme;
	};

	let { theme }: Props = $props();

	/** The device's light or dark setting, which updates when the device changes it. */
	const systemPrefersDark = new MediaQuery('prefers-color-scheme: dark');

	$effect(() => {
		document.documentElement.dataset.theme = resolveTheme(theme, systemPrefersDark.current);
	});
</script>
