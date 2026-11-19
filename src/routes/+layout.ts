import { loadRoutines } from '#lib/routine-loading.ts';
import { DexieStorage } from '#lib/storage/dexie-storage.ts';
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
 * with the routines saved, saving its runs in the same storage.
 *
 * @remarks
 * `crypto.randomUUID` is wrapped rather than passed as it is, because called on its own, away from
 * `crypto`, it throws "Illegal invocation" in browsers.
 *
 * @returns The new timer session.
 * @throws Rejects with storage's own error when the routines can't be read or saved.
 */
async function openTimerSession(): Promise<TimerSession> {
	const storage = new DexieStorage();
	const newId = (): string => crypto.randomUUID();
	const routines = await loadRoutines(storage, new Date(), newId);
	return new TimerSession(routines, { clock: () => Date.now(), storage, newId });
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
