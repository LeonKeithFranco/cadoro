// Routines and their blocks, shaped as in the data model in `docs/SPEC.md`.

import { counted } from './plural';

/** Part of a routine: a work target, a break percentage and a number of cycles. */
export type Block = {
	/** A UUID. */
	id: string;
	/** 1–50 characters. */
	title: string;
	/** The work time aimed for, in whole minutes, 1–240. */
	targetMinutes: number;
	/** The break earned, as a whole-number percentage of the time worked, 1–100. */
	breakPercent: number;
	/**
	 * How many times the block's work and break repeat before the next block, 1–99. Always 1 when
	 * it's the routine's only block, because rounds repeat a single block.
	 */
	cycles: number;
};

/** A named plan made of blocks, which repeats a set number of rounds or forever. */
export type Routine = {
	/** A UUID. */
	id: string;
	/** 1–50 characters. */
	title: string;
	/** How many times the run goes through all the blocks, 1–99, or forever. */
	rounds: number | 'infinite';
	/** 1–20 blocks, in run order. */
	blocks: Block[];
	/** Its place in the custom sort order. */
	customPosition: number;
	/** When it was created, as a UTC timestamp. */
	createdAt: string;
	/** When it was deleted, as a UTC timestamp. Deleted routines are kept, hidden, so stats keep their name. */
	deletedAt: string | null;
};

/**
 * Trims the spaces around the routine's title and its blocks' titles, as they're saved.
 *
 * @param routine - The routine, as typed in the form.
 * @returns A new routine with every title trimmed. Everything else is as it was.
 */
export function withTrimmedTitles(routine: Routine): Routine {
	return {
		...routine,
		title: routine.title.trim(),
		blocks: routine.blocks.map((block) => ({ ...block, title: block.title.trim() }))
	};
}

/**
 * Compares two routines by their place in the custom order.
 *
 * @param a - The first routine.
 * @param b - The second routine.
 * @returns Negative when `a` comes first, positive when `b` does, and 0 when they share a
 * `customPosition`.
 */
export function compareCustomOrder(a: Routine, b: Routine): number {
	return a.customPosition - b.customPosition;
}

/**
 * Compares two routine titles for ordering, ignoring case and accents so "apple" sits with "Apple".
 *
 * @param a - The first title.
 * @param b - The second title.
 * @returns Negative when `a` comes first, positive when `b` does, 0 when they match.
 */
export function compareTitles(a: string, b: string): number {
	return a.localeCompare(b, 'en', { sensitivity: 'base' });
}

/**
 * Lists routines in custom order.
 *
 * @param routines - The routines in any order.
 * @returns A new list, lowest `customPosition` first. Routines that share a position keep their
 * order from `routines`.
 */
export function inCustomOrder(routines: Routine[]): Routine[] {
	return routines.toSorted(compareCustomOrder);
}

/**
 * Picks out the routines the user can choose from, in the order they're listed.
 *
 * @param routines - Routines in any order, deleted ones included.
 * @returns A new list of the routines not deleted, lowest `customPosition` first.
 */
export function pickableRoutines(routines: Routine[]): Routine[] {
	return inCustomOrder(routines.filter((routine) => routine.deletedAt === null));
}

/**
 * Makes a block with the defaults a new block starts with: titled "Focus", a 25-minute target, a
 * 20% break and 1 cycle.
 *
 * @param newId - Returns a new unique id each time it's called, such as `crypto.randomUUID`.
 * @returns A new block, which is valid as it is.
 */
export function newBlock(newId: () => string): Block {
	return { id: newId(), title: 'Focus', targetMinutes: 25, breakPercent: 20, cycles: 1 };
}

/**
 * Makes the routine that "+ New routine" opens for editing: a blank title, which must be filled
 * in, infinite rounds, and one default block.
 *
 * @remarks
 * It goes at the top of the list, so `customPosition` is 0. Whoever adds it to the routines makes
 * room for it with `insertRoutine`.
 *
 * @param now - The moment it's created.
 * @param newId - Returns a new unique id each time it's called, such as `crypto.randomUUID`.
 * @returns A new routine, not valid until its title is filled in.
 */
export function newRoutine(now: Date, newId: () => string): Routine {
	return {
		id: newId(),
		title: '',
		rounds: 'infinite',
		blocks: [newBlock(newId)],
		customPosition: 0,
		createdAt: now.toISOString(),
		deletedAt: null
	};
}

/**
 * Says whether a routine may be deleted, which it may unless it's the only one left, so there is
 * always one to run.
 *
 * @param routines - Every routine, deleted ones included.
 * @returns `true` when more than one routine isn't deleted.
 */
export function canDeleteRoutine(routines: Routine[]): boolean {
	return pickableRoutines(routines).length > 1;
}

/**
 * Words a routine's rounds and blocks for its card in the Routines list.
 *
 * @param routine - The routine to describe.
 * @returns The rounds, then the blocks, such as `2 rounds · 3 blocks`, `1 round · 1 block` or
 * `Repeats forever · 2 blocks`.
 */
export function describeRoutine(routine: Routine): string {
	const rounds =
		routine.rounds === 'infinite' ? 'Repeats forever' : counted(routine.rounds, 'round');
	return `${rounds} · ${counted(routine.blocks.length, 'block')}`;
}

/** A routine's content without what's unique to each copy, such as ids. */
type RoutineTemplate = Pick<Routine, 'title' | 'rounds'> & {
	/** The blocks, in run order, without ids. */
	blocks: Omit<Block, 'id'>[];
};

/** The content of the routines the app starts with. */
const starterTemplates: RoutineTemplate[] = [
	{
		title: 'Classic',
		rounds: 'infinite',
		blocks: [{ title: 'Focus', targetMinutes: 25, breakPercent: 20, cycles: 1 }]
	},
	{
		title: 'Classic with long break',
		rounds: 'infinite',
		blocks: [
			{ title: 'Focus', targetMinutes: 25, breakPercent: 20, cycles: 3 },
			{ title: 'Long break', targetMinutes: 25, breakPercent: 60, cycles: 1 }
		]
	}
];

/**
 * Creates the two routines the app starts with.
 *
 * @remarks
 * The time and the id generator are passed in rather than read here, so the same inputs always
 * give the same routines, and tests can predict them.
 *
 * @param now - The moment the routines are created.
 * @param newId - Returns a new unique id each time it's called, such as `crypto.randomUUID`.
 * @returns Classic, then Classic with long break, in that custom order.
 */
export function createStarterRoutines(now: Date, newId: () => string): Routine[] {
	const createdAt = now.toISOString();

	return starterTemplates.map((template, index) => ({
		id: newId(),
		title: template.title,
		rounds: template.rounds,
		blocks: template.blocks.map((block) => ({ id: newId(), ...block })),
		customPosition: index,
		createdAt,
		deletedAt: null
	}));
}
