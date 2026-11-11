import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-static';
import { withPwa } from '@vite-pwa/sveltekit';
// The extension is needed because Vite plans to load its config as a native Node module, which
// doesn't guess extensions the way a bundler does.
import { devPort } from './dev-server.ts';

/**
 * The folder the app is served from, such as `/cadoro` on GitHub Pages, or `''`, the site's root,
 * when `BASE_PATH` isn't set.
 *
 * @remarks
 * SvelteKit stops with an error unless it's empty or starts with `/` and doesn't end with one.
 * That check is why the variable's plain `string` can be asserted to the type SvelteKit expects.
 */
const basePath = (process.env.BASE_PATH ?? '') as '' | `/${string}`;

/**
 * The page that starts the app for every address. The adapter writes it, and the service worker
 * keeps it and answers every address with it when offline.
 */
const FALLBACK_PAGE = 'index.html';

/**
 * The address the service worker keeps the fallback page under: the app's own folder, relative to
 * the service worker, which sits in it.
 *
 * @remarks
 * Every server gives the fallback page for the folder's address, such as `/cadoro/`, while
 * SvelteKit's preview server returns 404 for `/cadoro/index.html` itself. A file the service
 * worker can't fetch stops it installing.
 */
const FALLBACK_ADDRESS = './';

/**
 * The dark theme's page background, Tailwind's `zinc-950`, for the installed app's title bar and
 * the splash screen shown while it opens. The theme is fixed to dark until Settings can change it.
 */
const DARK_BACKGROUND = '#09090b';

/** How Vite builds and serves the app, with SvelteKit's config and Vitest's test projects. */
export default defineConfig({
	// Fails rather than moving to the next free port, so the server is always where Playwright
	// looks for it.
	server: { port: devPort, strictPort: true },
	plugins: [
		tailwindcss(),
		// Runs SvelteKit's own plugin with the first argument, its config, and adds a service worker
		// and web app manifest from the second, so the app can be installed and opened offline.
		withPwa(
			{
				compilerOptions: {
					// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
					runes: ({ filename }) => {
						// Splits on either slash, so Windows paths work too.
						const isLibrary = filename.split(/[/\\]/).includes('node_modules');
						return isLibrary ? undefined : true;
					}
				},

				// SvelteKit puts the base path in front of every link built with `resolve()` and every
				// file it loads.
				paths: { base: basePath },

				// Builds plain static files into `build/`, for GitHub Pages and self-hosting. Nothing is
				// prerendered, so the fallback page starts the app for every route, and the client-side
				// router then shows the right screen.
				adapter: adapter({ fallback: FALLBACK_PAGE })
			},
			{
				// Workbox writes the whole service worker, which keeps every file the build lists.
				strategies: 'generateSW',
				// SvelteKit gives the plugin a relative base, `./`, so the service worker's address and
				// scope would follow the address of whichever screen opened first, such as
				// `/cadoro/settings/sw.js`. The absolute folder keeps them at the app's root.
				base: `${basePath}/`,
				generateSW: {
					// The plugin always looks for prerendered pages too, and the app prerenders none,
					// so a pattern that matches nothing is a warning rather than a failed build.
					globStrict: false,
					// Answers every page address with the kept fallback page, so any screen opens
					// offline.
					navigateFallback: FALLBACK_ADDRESS
				},
				// A new version waits until the user agrees to reload, rather than swapping the code
				// under an open page.
				registerType: 'prompt',
				// The app has one page for every address, written after the service worker is built,
				// so the plugin adds it to the files kept itself, under `FALLBACK_ADDRESS`.
				kit: {
					adapterFallback: FALLBACK_PAGE,
					spa: { fallbackMapping: FALLBACK_ADDRESS }
				},
				// `start_url` and `scope` are left out, so they follow the base path.
				manifest: {
					name: 'Cadoro',
					short_name: 'Cadoro',
					description: 'A timer for focused work, with breaks earned from the time worked.',
					// Opens in its own window, with no address bar.
					display: 'standalone',
					theme_color: DARK_BACKGROUND,
					background_color: DARK_BACKGROUND
				}
			}
		)
	],
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'client',
					browser: {
						enabled: true,
						provider: playwright(),
						instances: [{ browser: 'chromium', headless: true }]
					},
					include: ['src/**/*.svelte.test.ts'],
					exclude: ['src/lib/server/**']
				}
			},

			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					// The root's tests cover the config's own logic, such as the dev server's port.
					include: ['src/**/*.test.ts', '*.test.ts'],
					exclude: ['src/**/*.svelte.test.ts']
				}
			}
		]
	}
});
