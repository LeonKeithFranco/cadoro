import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
// The extension is needed because Vite plans to load its config as a native Node module, which
// doesn't guess extensions the way a bundler does.
import { devPort } from './dev-server.ts';

/** How Vite builds and serves the app, with SvelteKit's config and Vitest's test projects. */
export default defineConfig({
	// Fails rather than moving to the next free port, so the server is always where Playwright
	// looks for it.
	server: { port: devPort, strictPort: true },
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) => {
					// Splits on either slash, so Windows paths work too.
					const isLibrary = filename.split(/[/\\]/).includes('node_modules');
					return isLibrary ? undefined : true;
				}
			},

			// The folder the app is served from, such as `/cadoro` on GitHub Pages, or the site's root
			// when `BASE_PATH` isn't set. SvelteKit puts it in front of every link built with
			// `resolve()` and every file it loads, and stops with an error unless it starts with `/`
			// and doesn't end with one. That check is why the variable's plain `string` can be
			// asserted to the type SvelteKit expects.
			paths: { base: (process.env.BASE_PATH ?? '') as '' | `/${string}` },

			// Builds plain static files into `build/`, for GitHub Pages and self-hosting. Nothing is
			// prerendered, so the fallback page starts the app for every route, and the client-side
			// router then shows the right screen.
			adapter: adapter({ fallback: 'index.html' })
		})
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
