<!--
  @component
  A screen's name, shown as its heading and in the browser tab, the same way on every screen.
-->
<script lang="ts">
	/** The props a screen's heading takes. */
	type Props = {
		/** The screen's name, such as "Timer". */
		title: string;
	};

	let { title }: Props = $props();
</script>

<svelte:head>
	<title>{title} · Cadoro</title>
</svelte:head>

<h1 class="text-2xl font-semibold tracking-tight">{title}</h1>
