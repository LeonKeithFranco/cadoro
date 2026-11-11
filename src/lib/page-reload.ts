// Reloading the page, in a module of its own so component tests can replace it. The browser
// doesn't let `location.reload` itself be replaced or spied on, and a real reload would end the
// test.

/** Reloads the page, which loads the version of the app that's now in control. */
export function reloadPage(): void {
	location.reload();
}
