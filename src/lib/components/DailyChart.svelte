<!--
  @component
  The daily chart: a bar chart of the work time per day, with buttons to choose its range. It's a
  figure whose text alternative is a visually hidden table of the same values, since a screen
  reader can't read the bars.
-->
<script lang="ts">
	import { BarChart } from 'layerchart';
	import { RANGE_PRESETS, type RangePreset } from '../stats-range';
	import type { DayBar } from '../stats-view';
	import { PRIMARY_BUTTON_COLOURS, SECONDARY_BUTTON_COLOURS } from './button-classes';
	import Card from './Card.svelte';

	/** The props the daily chart takes. */
	type Props = {
		/** A bar for every day of the range, oldest first. */
		bars: DayBar[];
		/** The range shown. */
		preset: RangePreset;
		/** Called with a preset when the user chooses it. */
		onpreset: (preset: RangePreset) => void;
	};

	let { bars, preset, onpreset }: Props = $props();

	/**
	 * The size of the axis labels, in pixels, which Tailwind's `text-xs` below sets as 0.75rem.
	 * The chart is told too, since it measures the labels to leave out those that would overlap.
	 */
	const AXIS_LABEL_SIZE_PX = 12;

	/** The name of each preset, as its button says it. */
	const PRESET_NAMES: Record<RangePreset, string> = {
		'7d': '7 days',
		'30d': '30 days',
		'90d': '90 days',
		'1y': '1 year',
		all: 'All'
	};

	/** The label to draw under each bar, found by its day. */
	const labelOfDay = $derived(new Map(bars.map((bar) => [bar.day, bar.label])));

	/**
	 * Writes a bar's day as its axis label, such as "Nov 19".
	 *
	 * @param day - The bar's day as `yyyy-MM-dd`.
	 * @returns The day's label, or the day itself if no bar has it.
	 */
	function formatDay(day: string): string {
		return labelOfDay.get(day) ?? day;
	}
</script>

<Card title="Daily work time">
	<!-- The names don't fit five to a row on a phone, so the presets wrap instead of squeezing
	     them. On phones the buttons are 44px tall to touch, start three to a row and grow to fill
	     it, so no row ends in a gap. From `md` they're the shorter desktop size, at their own
	     widths on one row. -->
	<div role="group" aria-label="Range" class="mt-3 flex flex-wrap gap-2">
		{#each RANGE_PRESETS as option (option)}
			<button
				type="button"
				aria-pressed={option === preset}
				onclick={(): void => onpreset(option)}
				class="min-h-11 grow basis-[calc((100%-1rem)/3)] rounded-lg px-3 text-sm font-medium whitespace-nowrap md:min-h-0 md:grow-0 md:basis-auto md:py-1.5 md:text-base {option ===
				preset
					? PRIMARY_BUTTON_COLOURS
					: SECONDARY_BUTTON_COLOURS}"
			>
				{PRESET_NAMES[option]}
			</button>
		{/each}
	</div>

	<figure class="mt-4">
		<!-- LayerChart draws with CSS variables, which are set here to the app's rose accent and
		     zinc text, in both themes. Its axis labels are 10px by its own style, which is too small
		     on a phone, so they're set to AXIS_LABEL_SIZE_PX here, with the same size given to the
		     chart, which uses it to fit the labels. -->
		<div
			aria-hidden="true"
			class="h-56 [--color-primary:var(--color-rose-700)] [--color-surface-content:var(--color-zinc-700)] md:h-72 dark:[--color-primary:var(--color-rose-400)] dark:[--color-surface-content:var(--color-zinc-300)] [&_.lc-axis-tick-label]:text-xs"
		>
			<BarChart
				data={bars}
				x="day"
				y="minutes"
				padding={{ top: 8, right: 8, bottom: 24, left: 36 }}
				props={{
					bars: { strokeWidth: 0 },
					xAxis: {
						format: formatDay,
						tickOcclusion: true,
						tickLabelProps: { fontSize: AXIS_LABEL_SIZE_PX }
					},
					yAxis: { tickLabelProps: { fontSize: AXIS_LABEL_SIZE_PX } }
				}}
			/>
		</div>
		<table class="sr-only">
			<caption>Work time per day</caption>
			<thead>
				<tr>
					<th scope="col">Day</th>
					<th scope="col">Work time</th>
				</tr>
			</thead>
			<tbody>
				{#each bars as bar (bar.day)}
					<tr>
						<th scope="row">{bar.dateLabel}</th>
						<td>{bar.duration}</td>
					</tr>
				{/each}
			</tbody>
		</table>
		<figcaption class="sr-only">
			The minutes worked each day in the chosen range, which the table above also gives.
		</figcaption>
	</figure>
</Card>
