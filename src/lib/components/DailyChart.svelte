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
	import { PRIMARY_BUTTON_COLOURS, SECONDARY_BUTTON_COLOURS } from './button-colours';

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

	/** An id for the heading that names the figure, unique on the page. */
	const headingId = $props.id();
</script>

<section
	aria-labelledby={headingId}
	class="rounded-xl border border-zinc-200 bg-white p-4 md:p-6 dark:border-zinc-800 dark:bg-zinc-900"
>
	<h2 id={headingId} class="font-semibold md:text-lg">Daily work time</h2>

	<div role="group" aria-label="Range" class="mt-3 flex flex-wrap gap-2">
		{#each RANGE_PRESETS as option (option)}
			<button
				type="button"
				aria-pressed={option === preset}
				onclick={(): void => onpreset(option)}
				class={option === preset ? PRIMARY_BUTTON_COLOURS : SECONDARY_BUTTON_COLOURS}
			>
				{PRESET_NAMES[option]}
			</button>
		{/each}
	</div>

	<figure class="mt-4">
		<!-- LayerChart draws with CSS variables, which are set here to the app's rose accent and
		     zinc text, in both themes. -->
		<div
			aria-hidden="true"
			class="h-56 [--color-primary:var(--color-rose-700)] [--color-surface-content:var(--color-zinc-700)] md:h-72 dark:[--color-primary:var(--color-rose-400)] dark:[--color-surface-content:var(--color-zinc-300)]"
		>
			<BarChart
				data={bars}
				x="day"
				y="minutes"
				padding={{ top: 8, right: 8, bottom: 24, left: 36 }}
				props={{ xAxis: { format: formatDay, tickOcclusion: true } }}
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
						<th scope="row">{bar.label}</th>
						<td>{bar.duration}</td>
					</tr>
				{/each}
			</tbody>
		</table>
		<figcaption class="sr-only">
			The minutes worked each day in the chosen range, which the table above also gives.
		</figcaption>
	</figure>
</section>
