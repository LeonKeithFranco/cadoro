// What each block card on the timer screen shows: its title, its plan, and its work and break
// boxes. The rules live here, beside `viewRun`'s, so the card only lays out what it's given.

import type { Block } from './routine';
import type { RunView } from './run';
import { formatElapsed, formatRemaining, minutesToMs } from './time';

/**
 * What a work box's time means: `Work`, or `Work · Overtime` once it reaches its target, so
 * overtime isn't shown by colour alone.
 */
type WorkLabel = 'Work' | 'Work · Overtime';

/**
 * What a break box's time means: `Break earned` while the block's work grows it, `Break` while
 * it counts down or isn't in use, and `Break over` once it reaches 0:00.
 */
type BreakLabel = 'Break earned' | 'Break' | 'Break over';

/**
 * What one of a block's two boxes shows, the work box or the break box, which share a layout.
 */
export type TimerBoxView = {
	/** What the time means, such as `Work` or `Break earned`. */
	readonly label: WorkLabel | BreakLabel;
	/**
	 * The time worked, the break earned so far or the break left, such as `12:34`, or `0:00` when
	 * the box isn't in use.
	 */
	readonly time: string;
	/** The work box's target, such as `25:00`, shown after its time, or `null` for the break box. */
	readonly target: string | null;
	/** Whether this box's timer is the one in use, so it's highlighted. */
	readonly isActive: boolean;
	/** Whether the work box has reached its target, so it shows overtime. Never true for a break. */
	readonly isOvertime: boolean;
};

/** Everything one block card shows at one moment. */
export type BlockView = {
	/** The block's title, such as "Focus". */
	readonly title: string;
	/** The block's target and break percentage, such as "25 min · 20% break". */
	readonly summary: string;
	/** The work box, shown above the break box. */
	readonly work: TimerBoxView;
	/** The break box, shown below the work box. */
	readonly break: TimerBoxView;
};

/**
 * Works out what one block card shows, from the run's view at this moment.
 *
 * @remarks
 * During a work period, its block's work box counts up and its break box shows the break earned
 * so far. During a break, its block's break box counts down, and the work box keeps the time that
 * earned the break. Every other box shows `0:00`, as does every box before Play and after the run
 * ends.
 *
 * @param block - The block the card is for.
 * @param blockIndex - The block's place in its routine, counting from 0.
 * @param view - The run's view at this moment, from `viewRun`.
 * @returns What the card shows.
 */
export function viewBlock(block: Block, blockIndex: number, view: RunView): BlockView {
	const title = block.title;
	const summary = `${block.targetMinutes} min · ${block.breakPercent}% break`;
	const target = formatElapsed(minutesToMs(block.targetMinutes));
	const notInUse = formatElapsed(0);

	if (view.status === 'working' && view.block === blockIndex) {
		return {
			title,
			summary,
			work: {
				label: view.isOvertime ? 'Work · Overtime' : 'Work',
				time: formatElapsed(view.workedMs),
				target,
				isActive: true,
				isOvertime: view.isOvertime
			},
			break: breakBox('Break earned', formatElapsed(view.breakEarnedMs), false)
		};
	}

	if (view.status === 'break' && view.block === blockIndex) {
		return {
			title,
			summary,
			work: idleWorkBox(formatElapsed(view.workedMs), target),
			break: breakBox(view.isOver ? 'Break over' : 'Break', formatRemaining(view.remainingMs), true)
		};
	}

	return {
		title,
		summary,
		work: idleWorkBox(notInUse, target),
		break: breakBox('Break', notInUse, false)
	};
}

/**
 * Describes a work box whose timer isn't in use: one that hasn't started, or that's showing the
 * time that earned the break after it.
 *
 * @param time - The time it shows, such as `25:00` or `0:00`.
 * @param target - The block's target, such as `25:00`.
 * @returns The work box, not highlighted and never in overtime.
 */
function idleWorkBox(time: string, target: string): TimerBoxView {
	return { label: 'Work', time, target, isActive: false, isOvertime: false };
}

/**
 * Describes a break box, which has no target and never shows overtime.
 *
 * @param label - What its time means: `Break earned`, `Break` or `Break over`.
 * @param time - The time it shows, such as `5:00`.
 * @param isActive - Whether its timer is the one in use.
 * @returns The break box.
 */
function breakBox(label: BreakLabel, time: string, isActive: boolean): TimerBoxView {
	return { label, time, target: null, isActive, isOvertime: false };
}
