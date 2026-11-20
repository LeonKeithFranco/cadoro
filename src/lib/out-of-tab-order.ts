/**
 * Keeps an element out of the Tab order for as long as it's on the page, by holding its
 * `tabindex` at -1 whatever else sets it.
 *
 * @remarks
 * A Svelte action, used as `use:outOfTabOrder`, after `use:dragHandle`. `svelte-dnd-action` has no
 * option to take its drag handles out of the Tab order, and sets their `tabindex` to 0 again each
 * time a drag starts or ends. The Routines screen's Move up and Move down buttons cover moving
 * by keyboard, so the handles would only be extra stops that read out the library's drag
 * instructions. Mouse and touch still work, since -1 leaves an element focusable by clicking.
 *
 * @param element - The element to keep out of the Tab order.
 * @returns The action's `destroy`, which stops watching.
 */
export function outOfTabOrder(element: HTMLElement): { destroy: () => void } {
	/** Puts the element out of the Tab order, unless it already is. */
	function removeFromTabOrder(): void {
		if (element.tabIndex !== -1) {
			element.tabIndex = -1;
		}
	}

	removeFromTabOrder();
	const observer = new MutationObserver(removeFromTabOrder);
	observer.observe(element, { attributes: true, attributeFilter: ['tabindex'] });
	return { destroy: (): void => observer.disconnect() };
}
