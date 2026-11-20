// Contrast as the browser paints it, for tests that check colours against WCAG's minimums.

/** The most a colour's channel can be, in an 8-bit sRGB pixel. */
const MAX_CHANNEL = 255;

/** WCAG's minimum contrast for the outline of a control or other graphic (1.4.11). */
export const MIN_OUTLINE_CONTRAST = 3;

/** The sRGB pixel the browser paints for a CSS colour, as red, green, blue and alpha. */
type Pixel = readonly [red: number, green: number, blue: number, alpha: number];

/**
 * Paints a CSS colour onto a 1-pixel canvas and reads it back, which turns any colour syntax the
 * browser understands, such as Tailwind's `oklch()`, into sRGB.
 *
 * @param colour - A CSS colour, such as the computed `border-top-color` of an element.
 * @returns The pixel the browser painted, with channels from 0 to 255.
 * @throws {@link Error} When the browser gives no 2D canvas context.
 */
function paintedPixel(colour: string): Pixel {
	const canvas = document.createElement('canvas');
	canvas.width = 1;
	canvas.height = 1;
	const context = canvas.getContext('2d', { willReadFrequently: true });
	if (context === null) {
		throw new Error('The browser gave no 2D canvas context.');
	}
	context.fillStyle = colour;
	context.fillRect(0, 0, 1, 1);
	const [red = 0, green = 0, blue = 0, alpha = 0] = context.getImageData(0, 0, 1, 1).data;
	return [red, green, blue, alpha];
}

/**
 * Works out a pixel's relative luminance, as WCAG defines it.
 *
 * @param pixel - An opaque pixel.
 * @returns The luminance, from 0 for black to 1 for white.
 */
function relativeLuminance(pixel: Pixel): number {
	const [red = 0, green = 0, blue = 0] = pixel.map((channel) => {
		const fraction = channel / MAX_CHANNEL;
		return fraction <= 0.04045 ? fraction / 12.92 : ((fraction + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

/**
 * Works out the contrast ratio between two opaque colours.
 *
 * @param first - A CSS colour.
 * @param second - Another CSS colour.
 * @returns The ratio, from 1 for identical colours to 21 for black on white.
 */
export function contrastRatio(first: string, second: string): number {
	const [lighter, darker] = [first, second]
		.map((colour) => relativeLuminance(paintedPixel(colour)))
		.toSorted((a, b) => b - a);
	return ((lighter ?? 0) + 0.05) / ((darker ?? 0) + 0.05);
}

/**
 * Finds the colour an element sits on: the first opaque background of it or its ancestors.
 *
 * @param element - The element whose backdrop is wanted, its own background excluded.
 * @returns The CSS colour of that background.
 * @throws {@link Error} When no ancestor has an opaque background, since the page would then
 * show the browser's default, which isn't the app's.
 */
export function backdropColour(element: Element): string {
	for (let ancestor = element.parentElement; ancestor !== null; ancestor = ancestor.parentElement) {
		const colour = getComputedStyle(ancestor).backgroundColor;
		if (paintedPixel(colour)[3] === MAX_CHANNEL) {
			return colour;
		}
	}
	throw new Error('No ancestor has an opaque background to measure against.');
}
