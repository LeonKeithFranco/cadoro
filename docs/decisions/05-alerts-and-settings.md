# Decisions: milestone 5, Alerts and Settings

Chimes for a reached target and a finished break, the Settings screen, the theme, and the screen kept awake during a run. One branch, released as 0.7.0, built in packages.

## Alerts and Settings (`feat/alerts-and-settings`), 2026-11-19

### The chime files

- Four CC0 chimes from PWL's "Bell dings/chimes" on OpenGameArt, with the licence checked on the source page. Synthesising chimes with Web Audio was the fallback if no licence could be verified, and wasn't needed.
- Mono MP3 at 64 kbit/s, trimmed of silence, and matched at -24 LUFS. MP3 plays in every current browser. Opus in WebM or Ogg was rejected, because older Safari can't play it.
- The gain was set from each file's measured loudness. `loudnorm`'s linear mode was tried first and didn't match the files.
- The chimes are precached, so they play offline. `static/chimes/SOURCES.md` has each file's source.
- The default chime is `bell-ding-1` for both alerts. The spec named none. The files haven't been checked by ear.

### Settings in storage

- Dexie schema version 3 adds a `settings` table. Dexie creates a new table by itself, so the version has no data-moving upgrade function, and a test upgrades a real version-2 database.
- The table holds one row, under `current`, with only the settings the user has changed, and a read fills in the defaults. A default changed later then reaches users who never touched it. `saveSettings(changes)` merges into the row in one transaction, so two tabs saving different settings keep both.
- Settings are watched like the run in progress, so every tab follows a change. A chime id the app doesn't have plays the default chime.

### The theme

- No flash of the wrong theme: `DexieStorage` mirrors the theme to `localStorage` under `cadoro-theme`, and an inline script in `app.html` reads it before the first paint. Waiting for IndexedDB was rejected, because the page would paint dark first. The mirror is the one use of `localStorage`, and storage owns it, so no other code touches it.
- `ThemeSync` follows the device's setting live for `system`.

### The chimes' schedule

- `nextChime(run, now)` is pure. A chime is due only while its moment is ahead, so a 0-second break is silent and nothing catches up after its moment has passed, such as after a restore.
- `ChimePlayer` schedules the chime on the audio clock, since a background tab's timers are slowed down and the audio clock isn't. It plays nothing before `unlock()`, and a failed file is logged once and not retried. A chime already playing finishes when the schedule changes.
- `RunChimes` reschedules when the run or the chosen chime or volume changes, never on a tick.
- Every button press unlocks the audio, not just Play, since any press is a gesture the browser accepts for audio.
- Only one tab sounds each chime, with a Web Lock. A tab joins the `cadoro-chimes` queue on its first press, so the holder can always play, and the next unlocked tab takes over when it closes. Without Web Locks, or if the lock is refused, every unlocked tab sounds, and a refusal is logged. Letting every tab sound was rejected, since two tabs would play each chime twice.
- A Preview plays in any tab and never takes the lock, since it answers a click in that tab.

### The wake lock

- It's asked for while a timer counts, the page is visible and the setting is on, and released on Pause, when the run ends, when the setting is turned off, and when the page is hidden. The browser drops it on a hidden page anyway, so releasing says what's true. It's asked for again when the page is visible.

### The Settings screen

- The volume saves when the slider is released, not on every step, so dragging doesn't write storage dozens of times. The number shows at once while it's dragged.
- Persistent storage shows On, Off or Unknown, with "Ask again" only while it's Off.
- `lastRoutineId` is saved when a run starts, and the Timer opens on it, falling back to the first pickable routine.
- `TimerSession` gained `onPress` and `onRunStarted`, so the chimes and the saved routine hang off it without it knowing about either.

### Testing the chimes

- Journeys observe the chimes without listening: `AudioContext.currentTime` follows `Date.now()`, so Playwright's fake clock moves the audio clock, and each journey asserts every chime's start moment and file. That checks the schedule, not real playback. A chime on time in a background tab, and the screen staying on during a run on the phone, are device checks.
- Vitest browser runs in parallel worktrees can collide on a port ("Port 63315 already in use"), and running again fixes it.
