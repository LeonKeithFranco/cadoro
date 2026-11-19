// SvelteKit's hooks for the browser: they run as the app starts and when an error is thrown while
// loading or navigating.

import type { ClientInit, HandleClientError } from '@sveltejs/kit/hooks';
import { recordError } from '#lib/error-log.ts';
import { installGlobalErrorHandlers } from '#lib/global-error-handlers.ts';

/** The status of the "not found" error SvelteKit raises for an address no route matches. */
const NOT_FOUND_STATUS = 404;

/**
 * Starts the global error handlers once, as the app starts.
 *
 * @remarks
 * They record to the activity log once the root layout's `load` has opened storage, and to the
 * console until then.
 */
export const init: ClientInit = () => {
	installGlobalErrorHandlers(window);
};

/**
 * Records an error that SvelteKit caught while loading or navigating, then leaves its default
 * error page as it is.
 *
 * @remarks
 * An address no route matches is a 404, which isn't an error of the app, so it's not recorded.
 * The hook takes SvelteKit's `kind`, `error` and `event`, and uses the first two.
 */
export const handleError: HandleClientError = (caught) => {
	const isNotFound = caught.kind === 'framework' && caught.error.status === NOT_FOUND_STATUS;
	if (isNotFound) {
		return;
	}
	void recordError('An error was thrown while loading or navigating.', caught.error);
};
