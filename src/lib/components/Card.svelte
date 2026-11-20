<!--
  @component
  A card: a region named by its heading, which sits at the top with an optional snippet beside it,
  such as a button, and holds whatever the card shows below. Settings groups, the log, the chart
  and the totals tables are cards.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { CARD_CLASSES } from './card-classes';

	/** The props a card takes. */
	type Props = {
		/** The card's heading, which names the region. */
		title: string;
		/** Extra classes for the card, such as a top margin. */
		class?: string | undefined;
		/** What sits across from the heading, such as a button, or left out for nothing. */
		beside?: Snippet | undefined;
		/** What the card shows below its heading. */
		children: Snippet;
	};

	let { title, class: extraClasses, beside, children }: Props = $props();

	/** An id for the heading that names the card, unique on the page. */
	const headingId = $props.id();
</script>

<section aria-labelledby={headingId} class={[CARD_CLASSES, extraClasses]}>
	{#if beside === undefined}
		<h2 id={headingId} class="font-semibold md:text-lg">{title}</h2>
	{:else}
		<div class="flex flex-wrap items-center justify-between gap-3">
			<h2 id={headingId} class="font-semibold md:text-lg">{title}</h2>
			{@render beside()}
		</div>
	{/if}
	{@render children()}
</section>
