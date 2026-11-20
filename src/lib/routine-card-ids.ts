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
