/**
 * Works out the `id` of a routine's Edit button, which the Routines screen moves the keyboard
 * focus to once a form closes or a routine is deleted.
 *
 * @param routineId - The routine's id.
 * @returns The id the routine's card gives its Edit button.
 */
export function editButtonId(routineId: string): string {
	return `edit-routine-${routineId}`;
}

/**
 * Works out the `id` of a routine's heading, which can take the keyboard focus when its Edit
 * button is disabled because a run of the routine has started.
 *
 * @param routineId - The routine's id.
 * @returns The id the routine's card gives its heading.
 */
export function headingId(routineId: string): string {
	return `routine-heading-${routineId}`;
}
