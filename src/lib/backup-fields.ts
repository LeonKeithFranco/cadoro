// Reading fields of untrusted JSON, with a message that says where a field is wrong. Each reader
// either returns a value of the right type or throws an `InvalidBackupError`.

/** The reason a file isn't a valid backup, in a sentence to show the user. */
export class InvalidBackupError extends Error {}

/** A JSON object whose fields haven't been checked yet. */
export type JsonObject = Record<string, unknown>;

/**
 * Names a field by its place in the file, such as `routines[0].title`.
 *
 * @param path - The path of the object holding the field, or an empty string for the file itself.
 * @param key - The field's name.
 * @returns The field's path.
 */
export function fieldPath(path: string, key: string): string {
	return path === '' ? key : `${path}.${key}`;
}

/**
 * Checks that a value is a JSON object.
 *
 * @param value - The value to check.
 * @param path - Where the value is, for the message.
 * @returns The value, as an object.
 * @throws {@link InvalidBackupError} If it's missing, an array, `null` or not an object.
 */
export function asObject(value: unknown, path: string): JsonObject {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new InvalidBackupError(`${path} must be an object.`);
	}
	return value as JsonObject;
}

/**
 * Checks that a value is an array.
 *
 * @param value - The value to check.
 * @param path - Where the value is, for the message.
 * @returns The value, as an array of unchecked items.
 * @throws {@link InvalidBackupError} If it's missing or not an array.
 */
export function asArray(value: unknown, path: string): unknown[] {
	if (!Array.isArray(value)) {
		throw new InvalidBackupError(`${path} must be a list.`);
	}
	return value;
}

/**
 * Reads a field that must be a string.
 *
 * @param object - The object holding the field.
 * @param key - The field's name.
 * @param path - The object's path, for the message.
 * @returns The field's value.
 * @throws {@link InvalidBackupError} If the field is missing or isn't a string.
 */
export function stringField(object: JsonObject, key: string, path: string): string {
	const value = object[key];
	if (typeof value !== 'string') {
		throw new InvalidBackupError(`${fieldPath(path, key)} must be text.`);
	}
	return value;
}

/**
 * Reads a field that must be a string or `null`.
 *
 * @param object - The object holding the field.
 * @param key - The field's name.
 * @param path - The object's path, for the message.
 * @returns The field's value.
 * @throws {@link InvalidBackupError} If the field is missing or is neither a string nor `null`.
 */
export function nullableStringField(object: JsonObject, key: string, path: string): string | null {
	const value = object[key];
	if (value === null) {
		return null;
	}
	if (typeof value !== 'string') {
		throw new InvalidBackupError(`${fieldPath(path, key)} must be text or null.`);
	}
	return value;
}

/**
 * Reads a field that must be true or false.
 *
 * @param object - The object holding the field.
 * @param key - The field's name.
 * @param path - The object's path, for the message.
 * @returns The field's value.
 * @throws {@link InvalidBackupError} If the field is missing or isn't a boolean.
 */
export function booleanField(object: JsonObject, key: string, path: string): boolean {
	const value = object[key];
	if (typeof value !== 'boolean') {
		throw new InvalidBackupError(`${fieldPath(path, key)} must be true or false.`);
	}
	return value;
}

/**
 * Reads a field that must be a whole number within limits.
 *
 * @param object - The object holding the field.
 * @param key - The field's name.
 * @param path - The object's path, for the message.
 * @param minimum - The smallest allowed value.
 * @param maximum - The largest allowed value.
 * @returns The field's value.
 * @throws {@link InvalidBackupError} If the field is missing, isn't a whole number or is outside
 * the limits.
 */
export function integerField(
	object: JsonObject,
	key: string,
	path: string,
	minimum: number,
	maximum: number
): number {
	const value = object[key];
	if (typeof value !== 'number' || !Number.isInteger(value)) {
		throw new InvalidBackupError(`${fieldPath(path, key)} must be a whole number.`);
	}
	if (value < minimum || value > maximum) {
		throw new InvalidBackupError(`${fieldPath(path, key)} must be from ${minimum} to ${maximum}.`);
	}
	return value;
}

/**
 * Reads a field that must be a number that is not negative, such as a time in milliseconds.
 *
 * @param object - The object holding the field.
 * @param key - The field's name.
 * @param path - The object's path, for the message.
 * @returns The field's value.
 * @throws {@link InvalidBackupError} If the field is missing, isn't a finite number or is
 * negative.
 */
export function nonNegativeNumberField(object: JsonObject, key: string, path: string): number {
	const value = object[key];
	if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
		throw new InvalidBackupError(`${fieldPath(path, key)} must be a number, 0 or more.`);
	}
	return value;
}

/**
 * Checks that a string is a UTC timestamp in the form the app writes, such as
 * `2026-11-19T09:30:00.000Z`.
 *
 * @param text - The string to check.
 * @returns `true` when it's a real moment in that exact form.
 */
function isUtcTimestamp(text: string): boolean {
	const milliseconds = Date.parse(text);
	return !Number.isNaN(milliseconds) && new Date(milliseconds).toISOString() === text;
}

/**
 * Reads a field that must be a UTC timestamp.
 *
 * @param object - The object holding the field.
 * @param key - The field's name.
 * @param path - The object's path, for the message.
 * @returns The field's value.
 * @throws {@link InvalidBackupError} If the field is missing or isn't a UTC timestamp such as
 * `2026-11-19T09:30:00.000Z`.
 */
export function timestampField(object: JsonObject, key: string, path: string): string {
	const value = object[key];
	if (typeof value !== 'string' || !isUtcTimestamp(value)) {
		throw new InvalidBackupError(
			`${fieldPath(path, key)} must be a UTC timestamp such as 2026-11-19T09:30:00.000Z.`
		);
	}
	return value;
}

/**
 * Reads a field that must be a UTC timestamp or `null`.
 *
 * @param object - The object holding the field.
 * @param key - The field's name.
 * @param path - The object's path, for the message.
 * @returns The field's value.
 * @throws {@link InvalidBackupError} If the field is missing, or is neither `null` nor a UTC
 * timestamp.
 */
export function nullableTimestampField(
	object: JsonObject,
	key: string,
	path: string
): string | null {
	if (object[key] === null) {
		return null;
	}
	return timestampField(object, key, path);
}

/**
 * Reads a field that must be one of a few strings.
 *
 * @typeParam Choice - The strings allowed.
 * @param object - The object holding the field.
 * @param key - The field's name.
 * @param path - The object's path, for the message.
 * @param allowed - The strings allowed.
 * @returns The field's value.
 * @throws {@link InvalidBackupError} If the field is missing or isn't one of the allowed strings.
 */
export function choiceField<Choice extends string>(
	object: JsonObject,
	key: string,
	path: string,
	allowed: readonly Choice[]
): Choice {
	const value = object[key];
	const choice = allowed.find((candidate) => candidate === value);
	if (choice === undefined) {
		const options = allowed.map((candidate) => `"${candidate}"`).join(', ');
		throw new InvalidBackupError(`${fieldPath(path, key)} must be one of ${options}.`);
	}
	return choice;
}
