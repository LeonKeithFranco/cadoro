import type { PageLoad } from './$types';

/**
 * Reads the routines, deleted ones included, every work period and the run in progress for the
 * Stats screen, each time the screen is opened, so it shows work saved since it was last open. The
 * run in progress is where the work period that's still going is, which the page then follows.
 *
 * @remarks
 * Deleted routines are kept so their work stays in the stats, labelled as deleted.
 *
 * It waits for the layout's `load`, which opens the app's storage. Stats come only from saved
 * work periods, so the screen's figures are worked out from what this returns. If storage can't
 * be read, it rejects and SvelteKit shows its error page.
 */
export const load: PageLoad = async ({ parent }) => {
	const { storage } = await parent();
	const [routines, workPeriods, runInProgress] = await Promise.all([
		storage.getAllRoutines(),
		storage.getWorkPeriods(),
		storage.getRunInProgress()
	]);
	return { routines, workPeriods, runInProgress };
};
