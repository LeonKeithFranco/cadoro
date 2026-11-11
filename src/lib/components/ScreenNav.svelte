<!--
  @component
  The links between the app's screens. On phones it's a tab bar fixed to the bottom of the
  window, and from medium widths up it sits in the header. The current screen's link is
  highlighted and marked as the current page for screen readers.
-->
<script module lang="ts">
	import type { Component } from 'svelte';
	import type { LucideProps } from '@lucide/svelte';
	import type { RouteId } from '$app/types';
	import ChartColumn from '@lucide/svelte/icons/chart-column';
	import List from '@lucide/svelte/icons/list';
	import Settings from '@lucide/svelte/icons/settings';
	import Timer from '@lucide/svelte/icons/timer';

	/** A screen the navigation links to. */
	type Screen = {
		/** The screen's route, which is also its path, apart from any base path. */
		route: RouteId;
		/** The link's text. */
		label: string;
		/** The icon shown with the label. */
		icon: Component<LucideProps>;
	};

	/** The screens, in the order the navigation lists them. */
	const SCREENS: Screen[] = [
		{ route: '/', label: 'Timer', icon: Timer },
		{ route: '/routines', label: 'Routines', icon: List },
		{ route: '/stats', label: 'Stats', icon: ChartColumn },
		{ route: '/settings', label: 'Settings', icon: Settings }
	];
</script>

<script lang="ts">
	import { resolve } from '$app/paths';
	import { isCurrentScreen } from '../screens';

	/** The props the navigation takes. */
	type Props = {
		/** The route of the page showing, or null when the URL matches no route. */
		currentRoute: string | null;
	};

	let { currentRoute }: Props = $props();
</script>

<nav
	aria-label="Screens"
	class="fixed inset-x-0 bottom-0 z-10 flex border-t border-zinc-200 bg-white md:static md:ml-auto md:gap-1 md:border-t-0 md:bg-transparent dark:border-zinc-800 dark:bg-zinc-950 md:dark:bg-transparent"
>
	{#each SCREENS as screen (screen.route)}
		<a
			href={resolve(screen.route)}
			aria-current={isCurrentScreen(screen.route, currentRoute) ? 'page' : undefined}
			class="flex flex-1 flex-col items-center gap-1 py-2 text-xs text-zinc-600 hover:text-zinc-900 aria-[current=page]:font-semibold aria-[current=page]:text-rose-700 md:flex-none md:flex-row md:gap-2 md:rounded-md md:px-3 md:text-sm md:aria-[current=page]:bg-rose-50 dark:text-zinc-400 dark:hover:text-zinc-100 dark:aria-[current=page]:text-rose-400 md:dark:aria-[current=page]:bg-rose-950"
		>
			<screen.icon class="size-6 md:size-5" />
			{screen.label}
		</a>
	{/each}
</nav>
