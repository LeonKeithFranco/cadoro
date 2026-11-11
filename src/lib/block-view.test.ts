import { describe, expect, it } from 'vitest';
import { viewBlock } from './block-view';
import { createStarterRoutines } from './routine';
import { createRun, finish, next, pause, play, viewRun, type WorkView } from './run';
import { minutes, seconds } from './testing/durations';

/** The starter routine with two different blocks: Focus at 20% for 3 cycles, then Long break at 60%. */
const [, classicWithLongBreak] = createStarterRoutines(new Date(0), () => 'id');

/** The routine's first block, Focus. */
const focus = classicWithLongBreak.blocks[0];

/** The routine's second block, Long break. */
const longBreak = classicWithLongBreak.blocks[1];

/** A run of the routine, with its first work period started at 0. */
const working = play(createRun(classicWithLongBreak), 0);

/** The run on the first work period's break, after 25 minutes of work, which earned 5 minutes. */
const onBreak = next(working, minutes(25));

describe('viewBlock', () => {
	it("shows the block's title, target and break percentage", () => {
		const view = viewRun(working, 0);

		expect(viewBlock(focus, 0, view)).toMatchObject({
			title: 'Focus',
			summary: '25 min · 20% break'
		});
		expect(viewBlock(longBreak, 1, view)).toMatchObject({
			title: 'Long break',
			summary: '25 min · 60% break'
		});
	});

	it('shows every box at 0:00, with its target, before Play', () => {
		const view = viewRun(createRun(classicWithLongBreak), 0);

		expect(viewBlock(focus, 0, view)).toEqual({
			title: 'Focus',
			summary: '25 min · 20% break',
			work: {
				label: 'Work',
				time: '0:00',
				target: '25:00',
				isActive: false,
				isOvertime: false,
				progressPercent: 0
			},
			break: {
				label: 'Break',
				time: '0:00',
				target: null,
				isActive: false,
				isOvertime: false,
				progressPercent: 0
			}
		});
	});

	it('counts up the work box in use, with the break earned so far below it', () => {
		const view = viewRun(working, minutes(12) + seconds(30));

		expect(viewBlock(focus, 0, view)).toMatchObject({
			work: { label: 'Work', time: '12:30', target: '25:00', isActive: true, isOvertime: false },
			break: { label: 'Break earned', time: '2:30', isActive: false }
		});
	});

	it('shows overtime on the work box in use from its target, while it keeps counting', () => {
		const view = viewRun(working, minutes(31) + seconds(40));

		expect(viewBlock(focus, 0, view)).toMatchObject({
			work: { label: 'Work · Overtime', time: '31:40', isActive: true, isOvertime: true },
			break: { label: 'Break earned', time: '6:20', isOvertime: false }
		});
	});

	it('marks overtime from the moment the work reaches its target', () => {
		const justBefore = viewRun(working, minutes(25) - 1);
		const atTarget = viewRun(working, minutes(25));

		expect(viewBlock(focus, 0, justBefore).work.label).toBe('Work');
		expect(viewBlock(focus, 0, atTarget).work.label).toBe('Work · Overtime');
	});

	it('uses the boxes of the block the run is in', () => {
		const longBreakWork: WorkView = {
			status: 'working',
			block: 1,
			label: 'Round 1 · Block 2 of 2',
			workedMs: minutes(10),
			targetMs: minutes(25),
			isOvertime: false,
			breakEarnedMs: minutes(6),
			isRunning: true,
			isInProgress: true
		};

		expect(viewBlock(longBreak, 1, longBreakWork)).toMatchObject({
			work: { time: '10:00', isActive: true },
			break: { label: 'Break earned', time: '6:00' }
		});
		expect(viewBlock(focus, 0, longBreakWork)).toMatchObject({
			work: { time: '0:00', isActive: false },
			break: { label: 'Break', time: '0:00', isActive: false }
		});
	});

	it("leaves other blocks' boxes at 0:00 during a work period", () => {
		const view = viewRun(working, minutes(12));

		expect(viewBlock(longBreak, 1, view)).toEqual({
			title: 'Long break',
			summary: '25 min · 60% break',
			work: {
				label: 'Work',
				time: '0:00',
				target: '25:00',
				isActive: false,
				isOvertime: false,
				progressPercent: 0
			},
			break: {
				label: 'Break',
				time: '0:00',
				target: null,
				isActive: false,
				isOvertime: false,
				progressPercent: 0
			}
		});
	});

	it('counts down the break box in use, keeping the time that earned it in the work box', () => {
		const view = viewRun(onBreak, minutes(27));

		expect(viewBlock(focus, 0, view)).toMatchObject({
			work: { label: 'Work', time: '25:00', isActive: false, isOvertime: false },
			break: { label: 'Break', time: '3:00', isActive: true }
		});
	});

	it('shows the work that earned a break without overtime, even when it ran past its target', () => {
		const breakAfterOvertime = next(working, minutes(30));

		expect(viewBlock(focus, 0, viewRun(breakAfterOvertime, minutes(30))).work).toEqual({
			label: 'Work',
			time: '30:00',
			target: '25:00',
			isActive: false,
			isOvertime: false,
			progressPercent: 100
		});
	});

	it('rounds the work down and the break left up, as a stopwatch and a countdown do', () => {
		const workView = viewRun(working, seconds(59) + 999);
		const breakView = viewRun(onBreak, minutes(25) + 500);

		expect(viewBlock(focus, 0, workView).work.time).toBe('0:59');
		expect(viewBlock(focus, 0, breakView).break.time).toBe('5:00');
	});

	it('shows a paused break with the time it had left', () => {
		const paused = pause(onBreak, minutes(27));

		expect(viewBlock(focus, 0, viewRun(paused, minutes(40))).break).toEqual({
			label: 'Break',
			time: '3:00',
			target: null,
			isActive: true,
			isOvertime: false,
			progressPercent: 60
		});
	});

	it('shows the break as over at 0:00, still in use until Play', () => {
		const view = viewRun(onBreak, minutes(31));

		expect(viewBlock(focus, 0, view).break).toEqual({
			label: 'Break over',
			time: '0:00',
			target: null,
			isActive: true,
			isOvertime: false,
			progressPercent: 0
		});
	});

	it("fills the work box's bar towards its target, with the break earned box's bar empty", () => {
		const view = viewRun(working, minutes(12) + seconds(30));

		const { work, break: breakBox } = viewBlock(focus, 0, view);
		expect(work.progressPercent).toBe(50);
		expect(breakBox.progressPercent).toBe(0);
	});

	it("keeps the work box's bar full in overtime", () => {
		const atTarget = viewRun(working, minutes(25));
		const pastTarget = viewRun(working, minutes(31) + seconds(40));

		expect(viewBlock(focus, 0, atTarget).work.progressPercent).toBe(100);
		expect(viewBlock(focus, 0, pastTarget).work.progressPercent).toBe(100);
	});

	it("empties the break box's bar as the break counts down, keeping the work box's bar", () => {
		const breakAfterTenMinutes = next(working, minutes(10));
		const startOfBreak = viewRun(breakAfterTenMinutes, minutes(10));
		const halfwayThrough = viewRun(breakAfterTenMinutes, minutes(11));

		expect(viewBlock(focus, 0, startOfBreak)).toMatchObject({
			work: { progressPercent: 40 },
			break: { progressPercent: 100 }
		});
		expect(viewBlock(focus, 0, halfwayThrough)).toMatchObject({
			work: { progressPercent: 40 },
			break: { progressPercent: 50 }
		});
	});

	it("leaves the break box's bar empty after work too short to earn a second of break", () => {
		const noBreakEarned = next(working, seconds(2));

		expect(viewBlock(focus, 0, viewRun(noBreakEarned, seconds(2))).break).toMatchObject({
			label: 'Break over',
			progressPercent: 0
		});
	});

	it('shows every box at 0:00 once the run has ended', () => {
		const view = viewRun(finish(working, minutes(10)), minutes(10));

		expect(viewBlock(focus, 0, view)).toMatchObject({
			work: { time: '0:00', isActive: false, isOvertime: false },
			break: { label: 'Break', time: '0:00', isActive: false }
		});
	});
});
