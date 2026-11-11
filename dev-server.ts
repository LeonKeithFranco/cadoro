// The dev server's port, shared by Vite, which listens on it, and Playwright, which tests it.

/** Vite's own default port, used when `PORT` isn't set. */
const DEFAULT_PORT = 5173;

/**
 * Reads the dev server's port from the environment.
 *
 * @remarks
 * Each git worktree runs its dev server on its own port, such as `PORT=5174 npm run test:e2e`.
 * Otherwise Playwright, which reuses a server already on its port, would test another worktree's
 * code.
 *
 * @param environment - The environment variables, such as `process.env`.
 * @returns `PORT` as a number, or 5173 when it isn't set or is empty.
 * @throws {@link Error}
 * When `PORT` isn't a whole number from 1 to 65535.
 */
export function readDevPort(environment: NodeJS.ProcessEnv): number {
	const configured = environment.PORT;
	if (!configured) {
		return DEFAULT_PORT;
	}

	const port = Number(configured);
	const isValidPort = Number.isInteger(port) && port >= 1 && port <= 65_535;
	if (!isValidPort) {
		throw new Error(`PORT must be a whole number from 1 to 65535, but it's "${configured}"`);
	}
	return port;
}

/** The port the dev server listens on and Playwright tests. */
export const devPort = readDevPort(process.env);
