// Pins the time zone to one whose clocks change at midnight, for tests of the stats. A test file
// imports this module first, instead of `time-zone.ts`, and each Vitest file runs in its own
// worker, so the zone holds for the whole file.

/**
 * The zone the midnight-change tests run in. On Sunday 2026-09-06 its clocks go from 23:59:59 on
 * Saturday straight to 01:00, so that day has no midnight and is 23 hours long.
 */
export const SANTIAGO_TIME_ZONE = 'America/Santiago';

// Node re-reads TZ when `process.env.TZ` is assigned.
process.env.TZ = SANTIAGO_TIME_ZONE;
