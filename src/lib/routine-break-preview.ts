// The break a block earns at its work target, which the routine form previews.

import type { Block } from './routine';
import { earnedBreakMs } from './run';
import { formatRemaining, minutesToMs } from './time';

/**
 * Works out the break a block earns when its work reaches the target.
 *
 * @remarks
 * It uses the engine's `earnedBreakMs`, so the preview rounds exactly as a real break does.
 *
 * @param block - The block, with a valid target and break percentage.
 * @returns The break earned at the target, in whole seconds, as milliseconds.
 */
export function breakAtTargetMs(block: Block): number {
	return earnedBreakMs(minutesToMs(block.targetMinutes), block.breakPercent);
}

/**
 * Describes the break a block earns at its target, such as "5:00 break at the 25-minute target".
 *
 * @param block - The block, with a valid target and break percentage.
 * @returns The sentence the routine form shows under the break field.
 */
export function describeBreakAtTarget(block: Block): string {
	const breakText = formatRemaining(breakAtTargetMs(block));
	return `${breakText} break at the ${block.targetMinutes}-minute target`;
}
