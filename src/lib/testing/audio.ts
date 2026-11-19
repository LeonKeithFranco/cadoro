// A fake audio context and fake chime files for tests of the chime player. Node has no Web Audio,
// and a real context's clock moves on its own, so the fake keeps a clock the test sets and
// records every source it makes, showing what would play without speakers.

import type {
	ChimeAudioContext,
	ChimeGain,
	ChimeOutput,
	ChimeSound,
	ChimeSource
} from '../chime-player';

/** A decoded chime from {@link FakeAudioContext}, which remembers which file it came from. */
export type FakeSound = ChimeSound & {
	/** The text of the file it was decoded from, which {@link fakeFiles} sets to the file's name. */
	readonly decodedFrom: string;
};

/** What a test can see of a chime's source made by {@link FakeAudioContext}. */
export class FakeSource implements ChimeSource {
	/** The chime the player gave it to play, or `null` before it does. */
	buffer: ChimeSound | null = null;
	/** What the source was connected to, in order. */
	readonly connections: ChimeOutput[] = [];
	/** When it was scheduled to start on the audio clock, or `null` if it never was. */
	startedAt: number | null = null;
	/** Whether it was stopped. */
	isStopped = false;

	connect(destination: ChimeOutput): unknown {
		this.connections.push(destination);
		return destination;
	}

	start(when: number): void {
		this.startedAt = when;
	}

	stop(): void {
		this.isStopped = true;
	}
}

/** What a test can see of the volume control made by {@link FakeAudioContext}. */
export class FakeGain implements ChimeGain {
	/** The gain, at full volume until the player sets it, as a new `GainNode` is. */
	readonly gain = { value: 1 };
	/** What the gain was connected to, in order. */
	readonly connections: ChimeOutput[] = [];

	connect(destination: ChimeOutput): unknown {
		this.connections.push(destination);
		return destination;
	}
}

/**
 * An audio context whose clock the test sets, and which keeps every node it makes.
 *
 * @remarks
 * It decodes a file by reading its bytes as text, so a test's file can say what it is. A file
 * whose text starts with {@link undecodable} fails to decode, as a file that isn't audio does.
 */
export class FakeAudioContext implements ChimeAudioContext {
	/** The audio clock, in seconds, which stays where the test sets it. */
	currentTime = 0;
	/** Stands in for the speakers, so a test can check what's connected to them. */
	readonly destination: ChimeOutput = { name: 'speakers' };
	/** Every source made, in order. */
	readonly sources: FakeSource[] = [];
	/** Every gain made, in order. */
	readonly gains: FakeGain[] = [];
	/** How many times `resume` was called. */
	resumeCount = 0;
	/** The error `resume` rejects with, or `null` for it to resolve. */
	resumeError: Error | null = null;

	resume(): Promise<void> {
		this.resumeCount++;
		return this.resumeError === null ? Promise.resolve() : Promise.reject(this.resumeError);
	}

	decodeAudioData(data: ArrayBuffer): Promise<FakeSound> {
		const text = new TextDecoder().decode(data);
		if (text.startsWith(undecodable)) {
			return Promise.reject(new Error('Unable to decode audio data'));
		}
		return Promise.resolve({ duration: 1, decodedFrom: text });
	}

	createGain(): FakeGain {
		const gain = new FakeGain();
		this.gains.push(gain);
		return gain;
	}

	createBufferSource(): FakeSource {
		const source = new FakeSource();
		this.sources.push(source);
		return source;
	}
}

/** The start of a fake file's text that makes {@link FakeAudioContext} fail to decode it. */
export const undecodable = 'not audio';

/**
 * Makes a fetch that serves fake chime files, and answers 404 for any other address, as a server
 * does for a missing file.
 *
 * @param files - Each address served, with the text its file holds, such as a name the test
 * looks for in {@link FakeSound.decodedFrom}, or one starting with {@link undecodable}.
 * @returns The fetch, for the player's `fetchFile`.
 */
export function fakeFiles(
	files: Readonly<Record<string, string>>
): (url: string) => Promise<Response> {
	return (url: string): Promise<Response> => {
		const text = files[url];
		const response = text === undefined ? new Response(null, { status: 404 }) : new Response(text);
		return Promise.resolve(response);
	};
}
