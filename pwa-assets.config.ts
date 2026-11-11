import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

/**
 * The background of icons that can't be transparent, Tailwind's `rose-700`. It matches the
 * rounded square in `static/favicon.svg`, so its corners blend in.
 */
const ICON_BACKGROUND = '#c70036';

/**
 * Makes every icon size the app needs from `static/favicon.svg`, and writes them next to it. Run
 * `npm run generate-icons` after changing the SVG.
 */
export default defineConfig({
	// `minimal2023Preset` is the generator's list of the sizes current browsers and phones ask for.
	// These two kinds of icon change it.
	preset: {
		...minimal2023Preset,
		// Android crops these to a circle or another shape, so they fill the whole square. The
		// timer stays inside the middle 80%, which is never cropped.
		maskable: {
			...minimal2023Preset.maskable,
			padding: 0,
			resizeOptions: { background: ICON_BACKGROUND }
		},
		// iOS rounds the corners itself and shows transparency as black.
		apple: {
			...minimal2023Preset.apple,
			padding: 0,
			resizeOptions: { background: ICON_BACKGROUND }
		}
	},
	images: ['static/favicon.svg']
});
