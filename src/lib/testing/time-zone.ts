// Pins the time zone that local days are worked out in, for tests of the stats. A test file imports
// this module first, so every date in it is read in the same zone, wherever the tests run.

/**
 * The zone the stats tests run in: it has daylight saving, which changes the clocks at 02:00 on a
 * Sunday, so those days are 23 or 25 hours long. Its midnight always exists, unlike a zone whose
 * clocks change at midnight, which `time-zone-santiago.ts` pins.
 */
export const TEST_TIME_ZONE = 'America/New_York';

// Node re-reads TZ when `process.env.TZ` is assigned. Tests of the zone itself, in `day-slices.test.ts`,
// fail if it ever stops doing so.
process.env.TZ = TEST_TIME_ZONE;
