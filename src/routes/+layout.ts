import { joinOpenTabs } from '#lib/open-tabs.ts';
import { loadRoutines } from '#lib/routine-loading.ts';
import { DexieStorage } from '#lib/storage/dexie-storage.ts';
import { askToPersistIfWorkSaved, askToPersistOnce } from '#lib/storage/persistence.ts';
import { TimerSession } from '#lib/timer.svelte.ts';
import type { LayoutLoad } from './$types';

/**
 * Turns off server-side rendering for every page, so pages render only in the browser.
 *
 * @remarks
 * The app is plain static files with its data in the browser. This makes the build a single-page
 * app: one fallback page that starts the app, whatever the URL. It also means `load` below runs
 * only in the browser, where IndexedDB is.
 */
export const ssr = false;

/**
 * The app's one timer session, made by the first `load` and handed back by every later one, so
 * a `load` running again, such as after `invalidateAll()`, can't start a second session and lose
 * the run.
 */
let timerSessionOpening: Promise<TimerSession> | undefined;

/**
 * Opens storage, creates the starter routines on the first launch, and starts the timer session
 * with the routines saved and the run in progress, if one is saved, saving its runs in the same
 * storage. It marks this tab as open, and tells the session whether another tab was, so a run
 * live in another tab isn't paused. It also asks for persistent storage, once, as soon as work is
 * saved.
 *
 * @remarks
 * `crypto.randomUUID` is wrapped rather than passed as it is, because called on its own, away from
 * `crypto`, it throws "Illegal invocation" in browsers.
 *
 * The check for saved work isn't waited for, so a slow answer from the browser, or Firefox's
 * prompt, never holds up the first render.
 *
 * TypeScript's DOM types say `navigator.locks` is always there, but it's missing outside HTTPS
 * and `localhost`, as `navigator.storage` is.
 *
 * @returns The new timer session.
 * @throws Rejects with storage's own error when the routines or the run in progress can't be
 * read, or the routines can't be saved.
 */
async function openTimerSession(): Promise<TimerSession> {
	const storage = new DexieStorage();
	const newId = (): string => crypto.randomUUID();
	const askToPersist = askToPersistOnce(navigator.storage);
	const locks: LockManager | undefined = navigator.locks;

	void askToPersistIfWorkSaved(storage, askToPersist);
	const [routines, saved, isAnotherTabOpen] = await Promise.all([
		loadRoutines(storage, new Date(), newId),
		storage.getRunInProgress(),
		joinOpenTabs(locks)
	]);
	return new TimerSession(
		routines,
		{
			clock: () => Date.now(),
			storage,
			newId,
			newRevision: newId,
			onWorkSaved: () => void askToPersist()
		},
		{ saved, isAnotherTabOpen }
	);
}

/**
 * Loads what every screen needs before the app first renders, so no screen shows without its
 * data. What it returns is the layout's `data`, which reaches every page below it.
 *
 * @remarks
 * SvelteKit runs it once when the app opens. It reads nothing that changes, such as the URL, so
 * moving between screens doesn't run it again. If storage can't be opened, it rejects and
 * SvelteKit shows its error page.
 */
export const load: LayoutLoad = async () => {
	timerSessionOpening ??= openTimerSession();
	return { timerSession: await timerSessionOpening };
};
