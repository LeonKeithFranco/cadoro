<!--
  @component
  A screen that isn't built yet: its heading, a line about what it will hold, and its title in
  the browser tab.
-->
<script lang="ts">
	/** The props a placeholder screen takes. */
	type Props = {
		/** The screen's name, shown as its heading and in the browser tab. */
		title: string;
		/** What the screen will hold once it's built. */
		message: string;
	};

	let { title, message }: Props = $props();
</script>

<svelte:head>
	<title>{title} · Cadoro</title>
</svelte:head>

<h1 class="text-2xl font-semibold tracking-tight">{title}</h1>
<p class="mt-2 text-zinc-600 dark:text-zinc-400">{message}</p>
