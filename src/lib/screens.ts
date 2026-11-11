/**
 * Works out whether a screen's navigation link is the current one.
 *
 * @remarks
 * A screen is current on its own route and on any route under it, so a page inside Settings
 * still highlights Settings. The Timer's route, `/`, is current only on itself, because no route
 * starts with `//`.
 *
 * @param screenRoute - The route the link goes to, such as `/routines`.
 * @param currentRoute - The route of the page showing, or null when the URL matches no route.
 * @returns Whether the link is for the screen showing.
 */
export function isCurrentScreen(screenRoute: string, currentRoute: string | null): boolean {
	if (currentRoute === null) return false;

	const isRouteUnderScreen = currentRoute.startsWith(`${screenRoute}/`);
	return currentRoute === screenRoute || isRouteUnderScreen;
}
