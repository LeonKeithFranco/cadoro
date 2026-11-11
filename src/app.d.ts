// Types for `virtual:pwa-register/svelte`, the module that registers the service worker and reports
// a waiting update. It's virtual: the PWA plugin writes it while building, so TypeScript can't find
// it on disk.
import '@unplugin-pwa/core/svelte';

// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	/**
	 * The app's version from `package.json`, such as `0.2.0`. Vite's `define` in `vite.config.ts`
	 * writes it into the code when it builds or serves the app.
	 */
	const __APP_VERSION__: string;

	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
