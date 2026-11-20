// Waiting in tests, for checking that something didn't happen.

/** How long {@link afterPendingWork} waits, in milliseconds. */
const PENDING_WORK_WAIT_MS = 50;

/**
 * Waits for every effect, chime load and request already started to finish, so a test can check
 * that something didn't happen.
 *
 * @returns A promise that settles after a few of the browser's tasks.
 */
export async function afterPendingWork(): Promise<void> {
	await new Promise<void>((resolve) => {
		setTimeout(resolve, PENDING_WORK_WAIT_MS);
	});
}
