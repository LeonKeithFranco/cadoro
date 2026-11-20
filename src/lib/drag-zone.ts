// The options the app's drag-handle zones share.

/**
 * The options of a `svelte-dnd-action` drag-handle zone, as the library takes them.
 *
 * @typeParam T - The type of the items, which each have an `id`.
 */
export type DragZoneOptions<T extends { id: string | number }> = {
	/** The items in the order the zone shows them. */
	items: T[];
	/** How long the library animates a move, in milliseconds. */
	flipDurationMs: number;
	/** The style the library gives a zone an item is over. */
	dropTargetStyle: Record<string, string>;
	/** The zone's tab index. */
	zoneTabIndex: number;
	/** Each item's tab index. */
	zoneItemTabIndex: number;
};

/**
 * Makes the options of a drag-handle zone that moves its items with no animation or outline.
 * Move up and Move down move items by keyboard, so neither the zone nor its items are Tab stops,
 * which the library makes of them by default. Each handle is kept out of the order by
 * `DragHandle`.
 *
 * @typeParam T - The type of the items, which each have an `id`.
 * @param items - The items in the order the zone shows them.
 * @returns The options to give `dragHandleZone`.
 */
export function dragZoneOptions<T extends { id: string | number }>(items: T[]): DragZoneOptions<T> {
	return {
		items,
		flipDurationMs: 0,
		dropTargetStyle: {},
		zoneTabIndex: -1,
		zoneItemTabIndex: -1
	};
}
