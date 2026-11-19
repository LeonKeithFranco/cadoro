import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { ChimePlayer } from './chime-player';
import { createRun, play } from './run';
import { minutes } from './testing/durations';
import { routineWith } from './testing/routines';

/** The moment the run starts, an arbitrary one in milliseconds since 1970. */
const start = Date.UTC(2026, 10, 19, 9, 0, 0);

// The failures are covered in Node, in `chime-player.test.ts`. This checks the defaults: that the
// browser's own `AudioContext` and `fetch` work with the player, and that a real chime decodes.
// The wall clock stays at the run's start, so the run's chime is still ahead whenever the player
// reads it, and the unlock isn't waited for, since without a gesture the context never resumes.
describe('ChimePlayer in the browser', () => {
	let logged: MockInstance<typeof console.error>;

	// A failure is logged rather than thrown, so the tests check that nothing was logged.
	beforeEach(() => {
		logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
	});

	// Puts the real `console.error` back.
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('decodes a real chime and schedules it with the browser’s own audio context', async () => {
		const player = new ChimePlayer({
			files: { target: '/chimes/bell-ding-1.mp3', break: '/chimes/bell-ding-2.mp3' },
			volume: 0,
			clock: (): number => start
		});
		const run = play(createRun(routineWith({ rounds: 'infinite' })), start);

		void player.unlock();
		await player.reschedule(run, start);

		expect(logged).not.toHaveBeenCalled();
		const [chime] = player.scheduled;
		expect(chime?.alert).toBe('target');
		expect(chime?.at).toBe(start + minutes(25));
		// The audio clock may have run a little since the context was made, which the start adds to
		// the 25 minutes.
		expect(chime?.startsAt).toBeGreaterThanOrEqual(25 * 60);
		expect(chime?.startsAt).toBeLessThan(25 * 60 + 1);
	});

	it.each([
		'/chimes/bell-ding-1.mp3',
		'/chimes/bell-ding-2.mp3',
		'/chimes/bell-ding-3.mp3',
		'/chimes/bell-ding-4.mp3'
	])('decodes the chime %s', async (file) => {
		const player = new ChimePlayer({
			files: { target: file, break: file },
			volume: 0,
			clock: (): number => start
		});
		const run = play(createRun(routineWith({ rounds: 'infinite' })), start);

		void player.unlock();
		await player.reschedule(run, start);

		expect(logged).not.toHaveBeenCalled();
		expect(player.scheduled.map((chime) => chime.file)).toEqual([file]);
	});
});
