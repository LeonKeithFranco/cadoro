// Routines and their blocks, shaped as in the data model in `docs/SPEC.md`.

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
