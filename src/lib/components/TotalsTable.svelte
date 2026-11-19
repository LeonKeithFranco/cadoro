<!--
  @component
  A card with a heading and a two-column table of totals, such as work time per week, month or
  routine, or a line saying there's none.
-->
<script lang="ts">
	import type { TotalRow } from '../stats-view';

	/** The props the totals table takes. */
	type Props = {
		/** The card's heading, such as "Weekly totals", which also names the table. */
		heading: string;
		/** The label for the column of names, such as "Week". */
		nameColumn: string;
		/** The rows to show, in order. */
		rows: TotalRow[];
		/** What to say instead of the table when there are no rows. */
		emptyMessage: string;
	};

	let { heading, nameColumn, rows, emptyMessage }: Props = $props();

	/** An id for the heading that this table's label points at, unique on the page. */
	const headingId = $props.id();
</script>

<section
	aria-labelledby={headingId}
	class="rounded-xl border border-zinc-200 bg-white p-4 md:p-6 dark:border-zinc-800 dark:bg-zinc-900"
>
	<h2 id={headingId} class="font-semibold md:text-lg">{heading}</h2>
	{#if rows.length === 0}
		<p class="mt-2 text-zinc-600 dark:text-zinc-400">{emptyMessage}</p>
	{:else}
		<table class="mt-3 w-full text-left">
			<thead>
				<tr class="text-sm text-zinc-600 dark:text-zinc-400">
					<th scope="col" class="pb-1 font-medium">{nameColumn}</th>
					<th scope="col" class="pb-1 text-right font-medium">Work time</th>
				</tr>
			</thead>
			<tbody class="divide-y divide-zinc-200 dark:divide-zinc-800">
				{#each rows as row (row.key)}
					<tr>
						<th scope="row" class="py-1.5 font-normal">{row.label}</th>
						<td class="py-1.5 text-right font-semibold tabular-nums">{row.duration}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</section>
