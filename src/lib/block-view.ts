// What each block card on the timer screen shows: its title, its plan, and its work and break
// boxes. The rules live here, beside `viewRun`'s, so the card only lays out what it's given.

import type { Block } from './routine';
import type { RunView } from './run';
import { formatElapsed, formatRemaining, minutesToMs } from './time';

/** What a block's work box shows. */
export type WorkBoxView = {
	/** The time worked, such as `12:34`, or `0:00` when the box isn't in use. */
	readonly time: string;
	/** The block's target, such as `25:00`. */
	readonly target: string;
	/** Whether this box's timer is the one in use, so it's highlighted. */
	readonly isActive: boolean;
	/** Whether the work in this box has reached its target, so the box shows overtime. */
	readonly isOvertime: boolean;
};

/** What a block's break box shows. */
export type BreakBoxView = {
	/**
	 * What the time means: `Break earned` while the block's work grows it, `Break` while it counts
	 * down or isn't in use, and `Break over` once it reaches 0:00.
	 */
	readonly label: 'Break earned' | 'Break' | 'Break over';
	/** The break earned so far, the break left, or `0:00` when the box isn't in use. */
	readonly time: string;
	/** Whether this box's timer is the one in use, so it's highlighted. */
	readonly isActive: boolean;
};

/** Everything one block card shows at one moment. */
export type BlockView = {
	/** The block's title, such as "Focus". */
	readonly title: string;
	/** The block's target and break percentage, such as "25 min · 20% break". */
	readonly summary: string;
	/** The work box, shown above the break box. */
	readonly work: WorkBoxView;
	/** The break box, shown below the work box. */
	readonly break: BreakBoxView;
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
				time: formatElapsed(view.workedMs),
				target,
				isActive: true,
				isOvertime: view.isOvertime
			},
			break: { label: 'Break earned', time: formatElapsed(view.breakEarnedMs), isActive: false }
		};
	}

	if (view.status === 'break' && view.block === blockIndex) {
		return {
			title,
			summary,
			work: { time: formatElapsed(view.workedMs), target, isActive: false, isOvertime: false },
			break: {
				label: view.isOver ? 'Break over' : 'Break',
				time: formatRemaining(view.remainingMs),
				isActive: true
			}
		};
	}

	return {
		title,
		summary,
		work: { time: notInUse, target, isActive: false, isOvertime: false },
		break: { label: 'Break', time: notInUse, isActive: false }
	};
}
