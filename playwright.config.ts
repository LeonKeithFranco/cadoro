import { defineConfig, devices } from '@playwright/test';
import { devPort } from './dev-server.ts';

/** Whether the tests run in CI, which sets `CI` to `true`. */
const isCi = !!process.env.CI;

/** The dev server's address, on the port from `PORT`, or 5173. */
const devUrl = `http://localhost:${devPort}`;

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
	// Both run every test against the dev server. Milestone 3 adds a project against a
	// production build, for what only it has, such as the service worker.
	projects: [
		{ name: 'desktop', use: { ...devices['Desktop Chrome'] } },
		{ name: 'phone', use: { ...devices['Pixel 7'] } }
	],
	webServer: {
		command: 'npm run dev',
		url: devUrl,
		// Locally, reuses a dev server that's already running.
		reuseExistingServer: !isCi
	}
});
