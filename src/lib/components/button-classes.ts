// The colours and shapes of the app's buttons, in light and dark, so every screen and dialog matches.
// Tailwind finds these class names here too, since it scans every source file for whole names.

/** The colours of a screen's or dialog's main button, filled in rose so it stands out. */
export const PRIMARY_BUTTON_COLOURS =
	'bg-rose-700 text-white hover:bg-rose-800 dark:bg-rose-400 dark:text-zinc-950 dark:hover:bg-rose-300';

/**
 * The shape of the small buttons inside a card, such as Edit and Move up, which take the colours
 * above. Disabled ones fade and show a not-allowed cursor.
 */
export const COMPACT_BUTTON_SHAPE =
	'inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60';

/**
 * The shape of a regular button, which takes the colours above. A disabled one fades and shows a
 * not-allowed cursor.
 */
export const BUTTON_SHAPE =
	'rounded-lg px-4 py-2 font-medium disabled:cursor-not-allowed disabled:opacity-60';

/**
 * The row of buttons at the foot of a dialog or a form: right-aligned, with every button the
 * same shape. Each dialog gives its buttons their colours, and a dialog adds its own top margin.
 */
export const DIALOG_ACTIONS = 'flex justify-end gap-3 *:rounded-lg *:px-6 *:py-2 *:font-medium';

/** The colours of the other buttons beside the main one, outlined so they step back. */
export const SECONDARY_BUTTON_COLOURS =
	'border border-zinc-500 bg-white text-zinc-900 hover:bg-zinc-100 dark:border-zinc-500 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800';
