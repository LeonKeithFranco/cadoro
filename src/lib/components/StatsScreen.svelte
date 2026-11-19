<!--
  @component
  The Stats screen: today's work, the streaks and the target figures, the daily chart with its
  range, the weekly and monthly totals and all-time work per routine, for every routine or one.
  With no work saved yet it shows a line saying so instead.
-->
<script lang="ts">
	import { resolve } from '$app/paths';
	import type { Routine } from '../routine';
	import type { WorkPeriod } from '../run-records';
	import type { RangePreset } from '../stats-range';
	import { viewStats } from '../stats-view';
	import DailyChart from './DailyChart.svelte';
	import ScreenHeading from './ScreenHeading.svelte';
	import TotalsTable from './TotalsTable.svelte';

	/** The props the Stats screen takes. */
	type Props = {
		/** Every saved work period. */
		workPeriods: WorkPeriod[];
		/** The routines to name and to filter by. */
		routines: Routine[];
		/** The current moment, in milliseconds since 1970 (UTC), which decides what "today" is. */
		now: number;
	};

	let { workPeriods, routines, now }: Props = $props();

	/** The value of the filter's "All routines" option, which no routine id can be. */
	const ALL_ROUTINES = '';

	/** The routine filter's value: a routine's id, or `ALL_ROUTINES`. */
	let filterValue = $state(ALL_ROUTINES);
	/** The daily chart's range. */
	let preset = $state<RangePreset>('7d');

	/**
	 * Changes the daily chart's range.
	 *
	 * @param chosen - The range the user chose.
	 */
	function choosePreset(chosen: RangePreset): void {
		preset = chosen;
	}

	/** Everything the screen shows, worked out again whenever the filter or the range changes. */
	const view = $derived(
		viewStats({
			workPeriods,
			routines,
			routineId: filterValue === ALL_ROUTINES ? null : filterValue,
			preset,
			now
		})
	);
</script>

<!-- One headline figure: its label above its value. -->
{#snippet figure(label: string, value: string)}
	<div
		class="rounded-xl border border-zinc-200 bg-white p-3 md:p-4 dark:border-zinc-800 dark:bg-zinc-900"
	>
		<dt class="text-sm text-zinc-600 dark:text-zinc-400">{label}</dt>
		<dd class="text-xl font-semibold tabular-nums md:text-2xl">{value}</dd>
	</div>
{/snippet}

<ScreenHeading title="Stats" />

{#if !view.hasWork}
	<p class="mt-2 text-zinc-600 dark:text-zinc-400">
		No work yet. Run a routine on the
		<a href={resolve('/')} class="font-medium text-rose-700 underline dark:text-rose-400">Timer</a>
		and your stats will appear here.
	</p>
{:else}
	<div class="mt-4 grid gap-4">
		<label class="block">
			<span class="text-sm font-medium text-zinc-700 dark:text-zinc-300">Routine</span>
			<select
				bind:value={filterValue}
				class="mt-1 block w-full rounded-md border-zinc-300 bg-white text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
			>
				<option value={ALL_ROUTINES}>All routines</option>
				{#each routines as routine (routine.id)}
					<option value={routine.id}>{routine.title}</option>
				{/each}
			</select>
		</label>

		<dl class="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4">
			{@render figure('Today', view.today)}
			{@render figure('Current streak', view.currentStreak)}
			{@render figure('Longest streak', view.longestStreak)}
			{@render figure('Time against target', view.timeAgainstTarget)}
			{@render figure('Targets reached', view.targetsReached)}
			{@render figure('All time', view.allTime)}
		</dl>

		<DailyChart bars={view.days} {preset} onpreset={choosePreset} />

		<div class="grid gap-4 md:grid-cols-2">
			<TotalsTable
				heading="Weekly totals"
				nameColumn="Week"
				rows={view.weeks}
				emptyMessage="No work yet."
			/>
			<TotalsTable
				heading="Monthly totals"
				nameColumn="Month"
				rows={view.months}
				emptyMessage="No work yet."
			/>
		</div>

		<TotalsTable
			heading="All time per routine"
			nameColumn="Routine"
			rows={view.routineTotals}
			emptyMessage="No work yet."
		/>
	</div>
{/if}
