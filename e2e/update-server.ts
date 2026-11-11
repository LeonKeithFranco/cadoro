// A static server for the production build, for the update journeys only. It serves `build/` under
// the base path, as Pages does, and serves a new version of the service worker to any browser that
// sends the next-version cookie, so a test finds an update without a second build. Playwright's own
// routing can't do this, because it doesn't see the browser's update check for the worker's script.
// A cookie belongs to one test's browser context, so tests running side by side can't affect each
// other.
//
// Run by Playwright as `node e2e/update-server.ts <port> <base path>`, after the production
// project's web server has built the app. Files are read on every request, so they're always
// those of the latest build.

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

/** The folder the build is written to, and served from. */
const BUILD_FOLDER = path.resolve('build');

/** The page that starts the app for every address that isn't a file. */
const FALLBACK_PAGE = path.join(BUILD_FOLDER, 'index.html');

/** The service worker's script, the one file that changes in a new version. */
const SERVICE_WORKER = 'sw.js';

/**
 * Text added to the end of the service worker. Any change to its bytes makes it a new version,
 * and a comment changes nothing it does.
 */
const NEXT_VERSION_MARK = '\n// The next version, served by the update tests.\n';

/** The cookie a test gives its browser to be served the next version from then on. */
export const NEXT_VERSION_COOKIE = { name: 'version', value: 'next' };

/** The content type of each kind of file the build has. */
const CONTENT_TYPES: Record<string, string> = {
	'.html': 'text/html',
	'.js': 'text/javascript',
	'.css': 'text/css',
	'.json': 'application/json',
	'.webmanifest': 'application/manifest+json',
	'.png': 'image/png',
	'.svg': 'image/svg+xml',
	'.ico': 'image/x-icon',
	'.txt': 'text/plain'
};

/**
 * Checks whether a request comes from a browser that asked for the next version.
 *
 * @param request - The browser's request.
 * @returns Whether the request carries the next-version cookie.
 */
function wantsNextVersion(request: IncomingMessage): boolean {
	const cookies = request.headers.cookie?.split(/;\s*/) ?? [];
	return cookies.includes(`${NEXT_VERSION_COOKIE.name}=${NEXT_VERSION_COOKIE.value}`);
}

/**
 * Finds the file an address under the base path asks for.
 *
 * @param relativePath - The address with the base path taken off, such as `sw.js` or `stats`.
 * @returns The file in the build, or the fallback page when there's no such file.
 */
async function findFile(relativePath: string): Promise<string> {
	const file = path.join(BUILD_FOLDER, relativePath);
	const isInBuild = file.startsWith(BUILD_FOLDER + path.sep);
	if (!isInBuild) {
		return FALLBACK_PAGE;
	}

	try {
		const details = await stat(file);
		return details.isFile() ? file : FALLBACK_PAGE;
	} catch {
		return FALLBACK_PAGE;
	}
}

/**
 * Sends a file from the build, as the next version if it's the service worker and the browser
 * asked for that.
 *
 * @param file - The file to send.
 * @param isNextVersion - Whether to serve the next version of the service worker.
 * @param response - Where to send it.
 */
async function sendFile(
	file: string,
	isNextVersion: boolean,
	response: ServerResponse
): Promise<void> {
	const contents = await readFile(file);
	const isServiceWorker = path.basename(file) === SERVICE_WORKER;
	const body =
		isServiceWorker && isNextVersion
			? Buffer.concat([contents, Buffer.from(NEXT_VERSION_MARK)])
			: contents;

	response.setHeader(
		'Content-Type',
		CONTENT_TYPES[path.extname(file)] ?? 'application/octet-stream'
	);
	response.end(body);
}

/**
 * Starts the server.
 *
 * @param port - The port to listen on. A port in use stops the server with an error.
 * @param basePath - The folder the app is served from, such as `/cadoro`.
 */
function serve(port: number, basePath: string): void {
	const appFolder = `${basePath}/`;

	createServer((request, response) => {
		const address = new URL(request.url ?? '/', 'http://localhost').pathname;
		if (!address.startsWith(appFolder)) {
			response.statusCode = 404;
			response.end();
			return;
		}

		const relativePath = decodeURIComponent(address.slice(appFolder.length));
		findFile(relativePath)
			.then((file) => sendFile(file, wantsNextVersion(request), response))
			.catch((error: unknown) => {
				// Until the build exists, Playwright's readiness check gets this and keeps waiting.
				response.statusCode = 500;
				response.end(String(error));
			});
	}).listen(port);
}

// Only when run as a script, so the tests can import the cookie above without starting a server.
if (import.meta.main) {
	const [port, basePath] = process.argv.slice(2);
	serve(Number(port), basePath ?? '');
}
