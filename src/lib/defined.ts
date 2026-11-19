/**
 * Returns a value that the caller knows exists, such as an array's item at an index the code has
 * already checked, so the type checker's `noUncheckedIndexedAccess` doesn't leave it as possibly
 * `undefined`.
 *
 * @remarks
 * A missing value is a bug in the caller's reasoning, so this throws rather than carrying on
 * with `undefined`.
 *
 * @typeParam T - The type of the value when it exists.
 * @param value - The value, such as `items[index]`.
 * @param description - What was expected to exist, for the error's message, such as "the block at
 * position 2".
 * @returns The value, typed as present.
 * @throws {@link Error} When the value is `undefined`.
 */
export function requireDefined<T>(value: T | undefined, description: string): T {
	if (value === undefined) {
		throw new Error(`Expected ${description} to exist, but it is missing.`);
	}
	return value;
}
