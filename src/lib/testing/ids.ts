// Ids for tests: predictable, unlike `crypto.randomUUID`, but each one different, so routines and
// blocks made in a test can be told apart.

/**
 * Makes an id generator that numbers its ids.
 *
 * @returns A function giving `id-1`, then `id-2`, and so on, counting separately from every
 * other generator.
 */
export function numberedIds(): () => string {
	let count = 0;
	return () => {
		count += 1;
		return `id-${count}`;
	};
}
