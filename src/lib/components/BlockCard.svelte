<!--
  @component
  One block of the chosen routine: its title with its cycle counter, its target and break
  percentage, and its work box above its break box. Each box shows its time with a progress bar below it. The box whose timer
  is in use is outlined in rose, or in amber once the work reaches its target.
-->
<script module lang="ts">
	import type { BlockView, TimerBoxView } from '../block-view';
	import { CARD_CLASSES } from './card-classes';

	/** How a box is coloured: not in use, in use, or in use past its target. */
	type BoxTone = 'idle' | 'active' | 'overtime';

	/**
	 * Works out how a box is coloured.
	 *
	 * @param box - The box.
	 * @returns `overtime` for a work box past its target, `active` for any other box in use, and
	 * `idle` otherwise.
	 */
	function toneOf(box: TimerBoxView): BoxTone {
		if (box.isOvertime) {
			return 'overtime';
		}
		return box.isActive ? 'active' : 'idle';
	}

	/**
	 * Says how far along a box is, in words a screen reader reads after its label.
	 *
	 * @param box - The box.
	 * @returns The time with its target when it has one, such as `4:00 of 25:00`, or else just the
	 * time.
	 */
	function progressText(box: TimerBoxView): string {
		return box.target === null ? box.time : `${box.time} of ${box.target}`;
	}

	/**
	 * Each tone's outline. The ring thickens the border without changing the box's size, so
	 * nothing shifts when a box becomes active.
	 */
	const OUTLINE: Record<BoxTone, string> = {
		idle: 'border-zinc-500 dark:border-zinc-500',
		active: 'border-rose-700 ring-1 ring-rose-700 dark:border-rose-400 dark:ring-rose-400',
		overtime: 'border-amber-700 ring-1 ring-amber-700 dark:border-amber-400 dark:ring-amber-400'
	};

	/** Each tone's progress bar fill. */
	const BAR_FILL: Record<BoxTone, string> = {
		idle: 'bg-zinc-500 dark:bg-zinc-400',
		active: 'bg-rose-700 dark:bg-rose-400',
		overtime: 'bg-amber-700 dark:bg-amber-400'
	};

	/** Each tone's colour for the time, which only overtime changes. */
	const TIME_COLOUR: Record<BoxTone, string> = {
		idle: '',
		active: '',
		overtime: 'text-amber-700 dark:text-amber-400'
	};
</script>

<script lang="ts">
	/** The props a block card takes. */
	type Props = {
		/** What the card shows at this moment, from `viewBlock`. */
		block: BlockView;
	};

	let { block }: Props = $props();

	const titleId = $props.id();
</script>

<!-- Named by its title, so each card is a region a screen reader can jump to. -->
<section aria-labelledby={titleId} class={CARD_CLASSES}>
	<!-- The cycle counter sits across from the title, as a box's target sits across from its
	     label. -->
	<div class="flex items-baseline justify-between gap-4">
		<h2 id={titleId} class="font-semibold md:text-lg">{block.title}</h2>
		{#if block.cycle !== null}
			<p class="text-sm font-medium text-zinc-600 tabular-nums md:text-base dark:text-zinc-400">
				{block.cycle}
			</p>
		{/if}
	</div>
	<p class="text-sm text-zinc-600 md:text-base dark:text-zinc-400">{block.summary}</p>
	<div class="mt-3 grid gap-3 md:mt-4 md:gap-4">
		{@render timerBox(block.work, `${titleId}-work`)}
		{@render timerBox(block.break, `${titleId}-break`)}
	</div>
</section>

<!-- One box's markup, drawn for the work box and again for the break box. Each is a group named
     by its label, so a screen reader announces "Work" or "Break earned" before the time. -->
{#snippet timerBox(box: TimerBoxView, labelId: string)}
	{@const tone = toneOf(box)}
	<div
		role="group"
		aria-labelledby={labelId}
		aria-current={box.isActive ? 'true' : undefined}
		class={['rounded-lg border px-4 py-3 md:px-6 md:py-5', OUTLINE[tone]]}
	>
		<!-- The label and time share a row, lined up on their text's baseline, with the bar
		     spanning the box below them. -->
		<div class="flex items-baseline justify-between gap-4">
			<p id={labelId} class="text-zinc-600 md:text-lg dark:text-zinc-400">{box.label}</p>
			<p class="text-3xl font-semibold tabular-nums md:text-5xl">
				<span class={TIME_COLOUR[tone]}>{box.time}</span>
				{#if box.target !== null}
					<span class="text-lg font-normal text-zinc-600 md:text-2xl dark:text-zinc-400">
						/ {box.target}
					</span>
				{/if}
			</p>
		</div>
		<!-- A progress bar named by the box's label, with its fill as the value, so a screen reader
		     can say how far along the box is as well as read the time it shows. The track has an
		     outline, since its pale fill alone is too faint against the card. -->
		<div
			role="progressbar"
			aria-labelledby={labelId}
			aria-valuemin={0}
			aria-valuemax={100}
			aria-valuenow={Math.round(box.progressPercent)}
			aria-valuetext={progressText(box)}
			class="mt-3 h-2 overflow-hidden rounded-full border border-zinc-500 bg-zinc-200 md:mt-4 md:h-3 dark:border-zinc-500 dark:bg-zinc-800"
		>
			<!-- A test id, because the bar is drawn only, with nothing a user reads to find it by. -->
			<div
				data-testid="progress-fill"
				class={['h-full rounded-full', BAR_FILL[tone]]}
				style:width="{box.progressPercent}%"
			></div>
		</div>
	</div>
{/snippet}
