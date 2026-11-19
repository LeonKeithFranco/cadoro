import { asset } from '$app/paths';
import { joinOpenTabs } from '#lib/open-tabs.ts';
import { loadRoutines } from '#lib/routine-loading.ts';
import { RunChimes } from '#lib/run-chimes.svelte.ts';
import { SettingsSession } from '#lib/settings.svelte.ts';
import { DexieStorage } from '#lib/storage/dexie-storage.ts';
import { askToPersistIfWorkSaved, askToPersistOnce } from '#lib/storage/persistence.ts';
import { TimerSession, type TimerSessionOptions } from '#lib/timer.svelte.ts';
import { WakeLockKeeper } from '#lib/wake-lock.svelte.ts';
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
 * The app's one timer session and settings session, made by the first `load` and handed back by
 * every later one, so a `load` running again, such as after `invalidateAll()`, can't start a
 * second session and lose the run.
 */
let appOpening: Promise<AppSessions> | undefined;

/** The sessions the app opens with, which every screen receives as the layout's data. */
type AppSessions = {
	/** The app's one timer session. */
	timerSession: TimerSession;
	/** The user's settings, following storage. */
	settingsSession: SettingsSession;
	/** Keeps the screen on during a run, and says whether the browser can. */
	wakeLockKeeper: WakeLockKeeper;
	/** The run's chimes, which Settings plays as previews. */
	chimes: RunChimes;
};

/**
 * Opens storage, creates the starter routines on the first launch, and starts the timer session
 * with the routines saved and the run in progress, if one is saved, saving its runs in the same
 * storage. It marks this tab as open, and tells the session whether another tab was, so a run
 * live in another tab isn't paused. It also asks for persistent storage, once, as soon as work is
 * saved, and starts the run's chimes, which every button press unlocks.
 *
 * @remarks
 * `crypto.randomUUID` is wrapped rather than passed as it is, because called on its own, away from
 * `crypto`, it throws "Illegal invocation" in browsers.
 *
 * The check for saved work isn't waited for, so a slow answer from the browser, or Firefox's
 * prompt, never holds up the first render.
 *
 * TypeScript's DOM types say `navigator.locks` is always there, but it's missing outside HTTPS
 * and `localhost`, as `navigator.storage` is. `navigator.wakeLock` is also missing there, and in
 * browsers without the Screen Wake Lock API.
 *
 * The settings are read with the routines, so the first render already has them.
 *
 * The chimes need the timer session, and the session's presses unlock the chimes, so the
 * session's `onPress` reaches the chimes made just after it, as does its `onTick`, which checks
 * the chime is still in place. No press or tick can come before then, since nothing has rendered
 * yet. The chimes follow the session for as long as the app is open, so
 * nothing else needs to keep them.
 *
 * The timer session saves the routine each run starts with as the settings' `lastRoutineId`, and
 * opens on it next time.
 *
 * @returns The new timer session, settings session, wake lock keeper and chimes.
 * @throws Rejects with storage's own error when the routines, the settings or the run in
 * progress can't be read, or the routines can't be saved.
 */
async function openApp(): Promise<AppSessions> {
	const storage = new DexieStorage();
	const newId = (): string => crypto.randomUUID();
	const askToPersist = askToPersistOnce(navigator.storage);
	const locks: LockManager | undefined = navigator.locks;

	void askToPersistIfWorkSaved(storage, askToPersist);
	const [routines, saved, isAnotherTabOpen, settings] = await Promise.all([
		loadRoutines(storage, new Date(), newId),
		storage.getRunInProgress(),
		joinOpenTabs(locks),
		storage.getSettings()
	]);
	const clock = (): number => Date.now();
	const settingsSession = new SettingsSession(storage, settings);
	const options: TimerSessionOptions = {
		clock,
		storage,
		newId,
		newRevision: newId,
		onWorkSaved: () => void askToPersist(),
		onPress: () => {
			chimes.unlock();
		},
		onRunStarted: (routineId) => {
			void settingsSession.save({ lastRoutineId: routineId });
		},
		onTick: () => {
			void chimes.catchUp();
		}
	};
	const timerSession = new TimerSession(routines, options, {
		saved,
		isAnotherTabOpen,
		lastRoutineId: settings.lastRoutineId
	});
	const chimes = new RunChimes({
		timer: timerSession,
		settings: settingsSession,
		clock,
		locks,
		address: asset
	});
	const wakeLock: WakeLock | undefined = navigator.wakeLock;
	const wakeLockKeeper = new WakeLockKeeper({
		timer: timerSession,
		settings: settingsSession,
		wakeLock,
		page: document
	});
	return { timerSession, settingsSession, wakeLockKeeper, chimes };
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
	appOpening ??= openApp();
	return await appOpening;
};
