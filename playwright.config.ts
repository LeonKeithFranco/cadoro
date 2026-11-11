import { defineConfig, devices } from '@playwright/test';
import { devPort } from './dev-server.ts';

/** Whether the tests run in CI, which sets `CI` to `true`. */
const isCi = !!process.env.CI;

/** The dev server's address, on the port from `PORT`, or 5173. */
const devUrl = `http://localhost:${devPort}`;

/**
 * The folder the production build is served from, as on GitHub Pages, so the tests catch a link
 * or file that ignores it. The dev server covers the site's root.
 */
const PRODUCTION_BASE_PATH = '/cadoro';

/**
 * The production build's port. It isn't Vite's preview default, 4173, so it never clashes with an
 * `npm run preview` you're running yourself.
 */
const PRODUCTION_PORT = 4175;

/** The production build's address, with a trailing slash so tests can use paths relative to it. */
const productionUrl = `http://localhost:${PRODUCTION_PORT}${PRODUCTION_BASE_PATH}/`;

/** Which tests run against the production build rather than the dev server. */
const PRODUCTION_TESTS = 'production/**';

/** How `npm run test:e2e` runs the Playwright tests in `e2e/`, locally and in CI. */
export default defineConfig({
	testDir: './e2e',
	fullyParallel: true,
	// Fails the CI run if a `test.only` was left in by mistake.
	forbidOnly: isCi,
	retries: isCi ? 2 : 0,
	reporter: isCi ? [['github'], ['html', { open: 'never' }]] : 'list',
	use: {
		baseURL: devUrl,
		// Keeps a trace only for tests that fail, so passing runs stay small.
		trace: 'retain-on-failure'
	},
	projects: [
		// Both run every other test against the dev server.
		{ name: 'desktop', testIgnore: PRODUCTION_TESTS, use: { ...devices['Desktop Chrome'] } },
		{ name: 'phone', testIgnore: PRODUCTION_TESTS, use: { ...devices['Pixel 7'] } },
		// Against a production build in a subfolder, for what only it has: the base path, and later
		// the service worker.
		{
			name: 'production',
			testMatch: PRODUCTION_TESTS,
			use: { ...devices['Desktop Chrome'], baseURL: productionUrl }
		}
	],
	webServer: [
		{
			command: 'npm run dev',
			url: devUrl,
			// Locally, reuses a dev server that's already running.
			reuseExistingServer: !isCi
		},
		{
			// Builds first, so the tests never run against an old build. Type checking is left to
			// its own step.
			command: `npx vite build && npx vite preview --port ${PRODUCTION_PORT} --strictPort`,
			// Both the build and the preview server read the base path from the config.
			env: { BASE_PATH: PRODUCTION_BASE_PATH },
			url: productionUrl,
			// Never reused, because a server left running could be serving an older build.
			reuseExistingServer: false
		}
	]
});
