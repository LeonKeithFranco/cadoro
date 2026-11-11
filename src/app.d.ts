// Types for `virtual:pwa-register`, the module that registers the service worker. It's virtual: the
// PWA plugin writes it while building, so TypeScript can't find it on disk.
import '@unplugin-pwa/core/vanillajs';

// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
