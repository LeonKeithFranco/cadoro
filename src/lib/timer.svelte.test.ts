import { beforeEach, describe, expect, it } from 'vitest';
import { createStarterRoutines } from './routine';
import { minutes, seconds } from './testing/durations';
import { TimerSession } from './timer.svelte';

/**
 * Makes an id generator that numbers its ids, so each routine and block gets a different one.
 *
 * @returns A function giving `id-1`, then `id-2`, and so on.
 */
function numberedIds(): () => string {
	let count = 0;
	return () => {
		count += 1;
		return `id-${count}`;
	};
}

/** The starter routines, Classic then Classic with long break, with predictable ids. */
const routines = createStarterRoutines(new Date(0), numberedIds());

/** The starter routines, by name. */
const [classic, classicWithLongBreak] = routines;

/** The fake clock's current moment, in milliseconds since 1970, which each test moves by hand. */
let nowMs = 0;

/**
 * Starts a session of the starter routines on the fake clock.
 *
 * @returns A new session, with Classic chosen and its run ready.
 */
function createSession(): TimerSession {
	return new TimerSession(routines, () => nowMs);
}

beforeEach(() => {
	nowMs = 0;
});

describe('TimerSession', () => {
	it('lists the routines to pick from in their order', () => {
		const session = createSession();

		const titles = session.routines.map((routine) => routine.title);
		expect(titles).toEqual(['Classic', 'Classic with long break']);
	});

	it('starts with the first routine chosen and its run ready', () => {
		const session = createSession();

		expect(session.routine).toBe(classic);
		expect(session.view).toEqual({
			status: 'ready',
			label: 'Round 1',
			isRunning: false,
			isInProgress: false
		});
	});

	it('refuses to start without a routine to pick', () => {
		expect(() => new TimerSession([], () => nowMs)).toThrow(
			'A timer session needs at least one routine.'
		);
	});
});

describe('choosing a routine', () => {
	it('chooses the routine and readies its run', () => {
		const session = createSession();

		session.select(classicWithLongBreak.id);

		expect(session.routine).toBe(classicWithLongBreak);
		expect(session.view).toMatchObject({
			status: 'ready',
			label: 'Round 1 · Block 1 of 2 · Cycle 1 of 3'
		});
	});

	it('changes nothing for an id that matches no routine', () => {
		const session = createSession();

		session.select('no-such-routine');

		expect(session.routine).toBe(classic);
		expect(session.view).toMatchObject({ status: 'ready', label: 'Round 1' });
	});

	it('keeps the routine and its run while the run is in progress', () => {
		const session = createSession();
		session.play();
		nowMs = seconds(10);

		session.select(classicWithLongBreak.id);
		session.tick();

		expect(session.routine).toBe(classic);
		expect(session.view).toMatchObject({ status: 'working', workedMs: seconds(10) });
	});

	it('keeps the routine while the run is paused', () => {
		const session = createSession();
		session.play();
		session.pause();

		session.select(classicWithLongBreak.id);

		expect(session.routine).toBe(classic);
	});

	it('can choose another routine once the run is finished', () => {
		const session = createSession();
		session.play();
		session.finish();

		session.select(classicWithLongBreak.id);

		expect(session.routine).toBe(classicWithLongBreak);
	});
});

describe('the controls', () => {
	it('starts the work period from the moment Play is pressed', () => {
		const session = createSession();
		nowMs = seconds(3);

		session.play();
		nowMs = seconds(3) + minutes(1);
		session.tick();

		expect(session.view).toMatchObject({
			status: 'working',
			workedMs: minutes(1),
			isRunning: true,
			isInProgress: true
		});
	});

	it('moves the view on to the clock only when ticked', () => {
		const session = createSession();
		session.play();
		nowMs = seconds(5);

		expect(session.view).toMatchObject({ workedMs: 0 });
		session.tick();
		expect(session.view).toMatchObject({ workedMs: seconds(5) });
	});

	it('pauses at the moment Pause is pressed, without waiting for a tick', () => {
		const session = createSession();
		session.play();
		nowMs = seconds(30);

		session.pause();

		expect(session.view).toMatchObject({ workedMs: seconds(30), isRunning: false });
	});

	it("shows each button's change even when the clock hasn't moved", () => {
		const session = createSession();

		session.play();
		expect(session.view).toMatchObject({ status: 'working', isRunning: true });
		session.pause();
		expect(session.view).toMatchObject({ status: 'working', isRunning: false });
	});

	it("doesn't count paused time as work", () => {
		const session = createSession();
		session.play();
		nowMs = seconds(30);
		session.pause();

		nowMs = minutes(5);
		session.tick();

		expect(session.view).toMatchObject({ workedMs: seconds(30), isRunning: false });
	});

	it('resumes a paused work period with Play', () => {
		const session = createSession();
		session.play();
		nowMs = seconds(30);
		session.pause();
		nowMs = minutes(5);

		session.play();
		nowMs = minutes(5) + seconds(10);
		session.tick();

		expect(session.view).toMatchObject({ workedMs: seconds(40), isRunning: true });
	});

	it('starts the earned break with Next, from the moment it is pressed', () => {
		const session = createSession();
		session.play();
		nowMs = minutes(25);

		session.next();

		expect(session.view).toMatchObject({
			status: 'break',
			workedMs: minutes(25),
			earnedMs: minutes(5),
			remainingMs: minutes(5),
			isRunning: true
		});
	});

	it('ends a break early with Next and starts the next work period', () => {
		const session = createSession();
		session.play();
		nowMs = minutes(25);
		session.next();
		nowMs = minutes(26);

		session.next();
		nowMs = minutes(27);
		session.tick();

		expect(session.view).toMatchObject({
			status: 'working',
			label: 'Round 2',
			workedMs: minutes(1)
		});
	});

	it('finishes the run with Finish and readies a new run of the same routine', () => {
		const session = createSession();
		session.select(classicWithLongBreak.id);
		session.play();
		nowMs = minutes(25);
		session.next();

		session.finish();

		expect(session.routine).toBe(classicWithLongBreak);
		expect(session.view).toEqual({
			status: 'ready',
			label: 'Round 1 · Block 1 of 2 · Cycle 1 of 3',
			isRunning: false,
			isInProgress: false
		});
	});

	it('leaves a ready run as it is on Pause, Next and Finish', () => {
		const session = createSession();

		session.pause();
		session.next();
		session.finish();

		expect(session.view).toMatchObject({ status: 'ready', isInProgress: false });
	});
});
