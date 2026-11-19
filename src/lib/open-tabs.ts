// Whether another tab of the app is open, through the browser's Web Locks API. Each open tab holds
// a shared lock for as long as it's open, and the browser lets it go when the tab closes,
// reloads or crashes, or the phone stops the app. So a tab opening can tell whether the run in
// progress is still live in another tab, which a heartbeat's age can't tell, since a hidden tab's
// heartbeats can be a minute apart.

/**
 * The name of the lock each open tab of the app holds. A tab still on an older version must see a
 * newer one, and the other way round, so it never changes.
 */
export const OPEN_TAB_LOCK = 'cadoro-open-tab';

/**
 * Says whether another tab of the app is open, then marks this tab as open until it closes.
 *
 * @remarks
 * The other tabs are checked before this tab takes its own lock, so two tabs opening at the same
 * moment both find none open, and both restore the run paused, rather than each taking the other
 * to have it live. Without the Web Locks API, as outside HTTPS and `localhost`, or if the browser
 * refuses the lock, no other tab can be seen, so this says none is open, and the run is
 * restored paused, as when the app opens alone. A refusal is logged.
 *
 * @param locks - The browser's lock manager, `navigator.locks`, or `undefined` where there's
 * none.
 * @param name - The lock's name. Tests give each check a name of its own, since a lock lasts as
 * long as the page.
 * @returns `true` if another tab held the lock, once this tab holds it too.
 */
export async function joinOpenTabs(
	locks: LockManager | undefined,
	name: string = OPEN_TAB_LOCK
): Promise<boolean> {
	if (locks === undefined) {
		return false;
	}

	try {
		const { held = [] } = await locks.query();
		const isAnotherTabOpen = held.some((lock) => lock.name === name);
		await holdUntilClosed(locks, name);
		return isAnotherTabOpen;
	} catch (error: unknown) {
		console.error('Could not tell whether the app is open in another tab.', error);
		return false;
	}
}

/**
 * Takes a shared lock and holds it until the page closes.
 *
 * @param locks - The browser's lock manager.
 * @param name - The lock's name.
 * @throws Rejects with the browser's error if it refuses the lock.
 */
async function holdUntilClosed(locks: LockManager, name: string): Promise<void> {
	const { promise: granted, resolve, reject } = Promise.withResolvers<void>();
	// The request's own promise settles only once the lock is let go, which is never while the
	// page is open, so it isn't waited for, and a refusal rejects `granted` instead.
	locks
		.request(name, { mode: 'shared' }, async () => {
			resolve();
			await new Promise<never>(() => {});
		})
		.catch(reject);
	await granted;
}
