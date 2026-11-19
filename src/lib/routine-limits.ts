// The limits on a routine and its blocks, from the data model in `docs/SPEC.md`.

/** The fewest characters a routine's or block's title may have, once trimmed. */
export const TITLE_MIN_LENGTH = 1;

/** The most characters a routine's or block's title may have, once trimmed. */
export const TITLE_MAX_LENGTH = 50;

/** The fewest rounds a finite routine may have. */
export const ROUNDS_MIN = 1;

/** The most rounds a finite routine may have. */
export const ROUNDS_MAX = 99;

/** The fewest blocks a routine may have. */
export const BLOCKS_MIN = 1;

/** The most blocks a routine may have. */
export const BLOCKS_MAX = 20;

/** The shortest work target a block may have, in whole minutes. */
export const TARGET_MINUTES_MIN = 1;

/** The longest work target a block may have, in whole minutes. */
export const TARGET_MINUTES_MAX = 240;

/** The smallest break percentage a block may have. */
export const BREAK_PERCENT_MIN = 1;

/** The largest break percentage a block may have. */
export const BREAK_PERCENT_MAX = 100;

/** The fewest cycles a block may have. */
export const CYCLES_MIN = 1;

/** The most cycles a block may have. */
export const CYCLES_MAX = 99;
