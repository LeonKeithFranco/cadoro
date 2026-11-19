import type { PageLoad } from './$types';

/**
 * Reads the routines, deleted ones included, and every work period for the Stats screen, each time
 * the screen is opened, so it shows work saved since it was last open.
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
	const [routines, workPeriods] = await Promise.all([
		storage.getAllRoutines(),
		storage.getWorkPeriods()
	]);
	return { routines, workPeriods };
};
