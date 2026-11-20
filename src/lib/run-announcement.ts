import type { RunView } from './run';

/**
 * Works out what a screen reader should be told about the run, for the Timer's live region.
 *
 * @remarks
 * A live region speaks when its text changes, so this gives one phrase per phase and an empty
 * string where nothing needs saying. The text then changes only as the run moves into overtime,
 * onto a break, past the break or to its end, never on a tick, and a phase's phrase is never
 * repeated while it lasts. The times themselves are not announced, since they change every
 * second.
 *
 * @param view - The run's view at this moment.
 * @returns `Overtime` once work reaches its target, `Break started` for a break that's still
 * counting down or waiting, `Break over` once it reaches 0:00, `Run ended` once the run ends,
 * and an empty string otherwise.
 */
export function announcementFor(view: RunView): string {
	switch (view.status) {
		case 'working':
			return view.isOvertime ? 'Overtime' : '';
		case 'break':
			return view.isOver ? 'Break over' : 'Break started';
		case 'ended':
			return 'Run ended';
		case 'ready':
			return '';
	}
}
