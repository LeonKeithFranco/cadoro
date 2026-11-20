// The colours of the app's form controls and the text around them, in light and dark, so every
// screen matches. Tailwind finds these class names here too, since it scans every source file for
// whole names.

/** The colours and corners of a text box or drop-down, which each screen adds its layout to. */
export const INPUT_COLOURS =
	'rounded-md border-zinc-500 bg-white text-zinc-900 dark:border-zinc-500 dark:bg-zinc-900 dark:text-zinc-100';

/** The colours of a radio button or a checkbox, whose ticks are rose. */
export const CHOICE_COLOURS =
	'border-zinc-500 bg-white text-rose-700 checked:bg-rose-700 focus:ring-rose-700 dark:border-zinc-500 dark:bg-zinc-900 dark:text-rose-400 dark:checked:bg-rose-400 dark:focus:ring-rose-400';

/** The text of a label above a control, such as a field's name. */
export const LABEL_TEXT = 'text-sm font-medium text-zinc-700 dark:text-zinc-300';

/** The text of a link inside a screen: medium weight, rose and underlined. */
export const LINK_TEXT =
	'font-medium text-rose-700 underline underline-offset-2 dark:text-rose-400';

/** The colours of an error message, such as a problem with a field or a failed action. */
export const ERROR_TEXT = 'text-rose-700 dark:text-rose-400';
