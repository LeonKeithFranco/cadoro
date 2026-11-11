// The colours of the app's buttons, in light and dark, so every screen and dialog matches.
// Tailwind finds these class names here too, since it scans every source file for whole names.

/** The colours of a screen's or dialog's main button, filled in rose so it stands out. */
export const PRIMARY_BUTTON_COLOURS =
	'bg-rose-700 text-white hover:bg-rose-800 dark:bg-rose-400 dark:text-zinc-950 dark:hover:bg-rose-300';

/** The colours of the other buttons beside the main one, outlined so they step back. */
export const SECONDARY_BUTTON_COLOURS =
	'border border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800';
