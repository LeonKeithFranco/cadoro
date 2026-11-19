// Recording the errors nothing else caught: uncaught exceptions and promises rejected with no one
// listening, which the browser reports as `error` and `unhandledrejection` events.

import { recordError } from './error-log';

/** What the handlers need of `window`, so tests can give them an `EventTarget` of their own. */
export type ErrorEventTarget = Pick<Window, 'addEventListener' | 'removeEventListener'>;

/**
 * Starts recording uncaught errors and unhandled rejections.
 *
 * @param target - What the browser sends the events to, which is `window`.
 * @returns A function that stops recording.
 */
export function installGlobalErrorHandlers(target: ErrorEventTarget): () => void {
	const onError = (event: ErrorEvent): void => {
		// A script error from another origin has no `error`, only a message.
		void recordError('An uncaught error occurred.', event.error ?? event.message);
	};
	const onRejection = (event: PromiseRejectionEvent): void => {
		void recordError('A promise was rejected and nothing handled it.', event.reason);
	};

	target.addEventListener('error', onError);
	target.addEventListener('unhandledrejection', onRejection);
	return (): void => {
		target.removeEventListener('error', onError);
		target.removeEventListener('unhandledrejection', onRejection);
	};
}
