// The chimes the app comes with, and the file each alert plays, from the chime ids that Settings
// keeps. Pure: the base path the files are served under is added by the caller.

import type { ChimeFiles } from './chime-player';
import type { Settings } from './settings';

/** The id of every chime in `static/chimes`, each the name of its file without `.mp3`. */
export const CHIME_IDS = ['bell-ding-1', 'bell-ding-2', 'bell-ding-3', 'bell-ding-4'] as const;

/** The id of one of the chimes the app comes with. */
export type ChimeId = (typeof CHIME_IDS)[number];

/**
 * The chime both alerts play until Settings changes them. The spec names none, so it's the first
 * of the recordings.
 */
export const DEFAULT_CHIME: ChimeId = 'bell-ding-1';

/** A chime's file, relative to the folder the app is served from, as SvelteKit's `asset` takes it. */
export type ChimeFile = `chimes/${ChimeId}.mp3`;

/**
 * Says whether an id names one of the chimes the app comes with.
 *
 * @param id - A chime id, such as one Settings kept.
 * @returns `true` if it's one of {@link CHIME_IDS}.
 */
function isChimeId(id: string): id is ChimeId {
	return CHIME_IDS.some((chime) => chime === id);
}

/**
 * Finds the file a chime id plays.
 *
 * @remarks
 * An id the app doesn't have, such as one a later version removed, plays {@link DEFAULT_CHIME},
 * so the alert still sounds rather than failing to load.
 *
 * @param id - The chime's id, as Settings keeps it.
 * @returns The chime's file, relative to the app's folder.
 */
export function chimeFile(id: string): ChimeFile {
	const chime = isChimeId(id) ? id : DEFAULT_CHIME;
	return `chimes/${chime}.mp3`;
}

/**
 * Works out the file each alert plays, from the chimes chosen in Settings.
 *
 * @param settings - The settings, whose `targetChime` and `breakChime` choose the chimes.
 * @param address - Turns a chime's file into the address the page fetches it from, such as
 * SvelteKit's `asset`, which puts the base path in front.
 * @returns The address of each alert's chime.
 */
export function chimeFilesFor(
	settings: Pick<Settings, 'targetChime' | 'breakChime'>,
	address: (file: ChimeFile) => string
): ChimeFiles {
	return {
		target: address(chimeFile(settings.targetChime)),
		break: address(chimeFile(settings.breakChime))
	};
}
