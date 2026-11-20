import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadTextFile } from './file-download';

// Puts back the real timers and what a test replaced, so no real download starts.
afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe('downloadTextFile', () => {
	it('clicks a link named for the file, to a Blob of the text with its type', async () => {
		const blobs: Blob[] = [];
		const clicked: { download: string; href: string }[] = [];
		vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
			blobs.push(blob as Blob);
			return 'blob:fake-url';
		});
		vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
		vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
			this: HTMLAnchorElement
		): void {
			clicked.push({ download: this.download, href: this.href });
		});

		downloadTextFile('cadoro-backup-2026-11-19.json', 'application/json', '{"a":1}');

		expect(clicked).toEqual([{ download: 'cadoro-backup-2026-11-19.json', href: 'blob:fake-url' }]);
		expect(blobs).toHaveLength(1);
		expect(blobs[0]?.type).toBe('application/json');
		expect(await blobs[0]?.text()).toBe('{"a":1}');
	});

	it('lets the Blob go only after a delay, once the download has started', () => {
		vi.useFakeTimers();
		vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake-url');
		const revoked = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
		vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

		downloadTextFile('a.csv', 'text/csv', 'x');
		expect(revoked).not.toHaveBeenCalled();

		vi.runAllTimers();
		expect(revoked).toHaveBeenCalledWith('blob:fake-url');
	});
});
