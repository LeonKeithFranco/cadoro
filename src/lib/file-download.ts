// Handing the user a file to save, which the browser does when a link with a `download` name is
// clicked.

/** A function that hands the user a file, so tests can stand in for the browser's download. */
export type SaveFile = (fileName: string, mimeType: string, text: string) => void;

/** How long the Blob's address stays valid after the click, in milliseconds. */
const REVOKE_DELAY_MS = 10_000;

/**
 * Starts a download of some text, by clicking a link to a Blob that holds it.
 *
 * @param fileName - What the browser calls the file.
 * @param mimeType - The file's type, such as `text/csv`.
 * @param text - The file's contents.
 */
export const downloadTextFile: SaveFile = (fileName, mimeType, text) => {
	const url = URL.createObjectURL(new Blob([text], { type: mimeType }));
	const link = document.createElement('a');
	link.href = url;
	link.download = fileName;
	link.click();
	// Firefox and Safari read the Blob after `click()` returns, so it goes on a later turn of the
	// event loop, once they have started the download.
	setTimeout((): void => {
		URL.revokeObjectURL(url);
	}, REVOKE_DELAY_MS);
};
