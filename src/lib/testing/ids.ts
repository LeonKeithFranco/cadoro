// Ids for tests: predictable, unlike `crypto.randomUUID`, but each one different, so routines and
// blocks made in a test can be told apart.

/**
 * Makes an id generator that numbers its ids.
 *
 * @param prefix - What each id starts with, so ids from two generators in one test, such as two
 * tabs' or a session's records and revisions, can be told apart.
 * @returns A function giving `id-1`, then `id-2`, and so on, with `prefix` in place of `id`,
 * counting separately from every other generator.
 */
export function numberedIds(prefix = 'id'): () => string {
	let count = 0;
	return () => {
		count += 1;
		return `${prefix}-${count}`;
	};
}
