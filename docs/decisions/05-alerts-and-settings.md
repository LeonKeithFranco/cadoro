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
- **Changed later:** the `theme-color` meta follows the theme too, in [the milestone review's fixes](#the-milestone-reviews-fixes).

### The chimes' schedule

- `nextChime(run, now)` is pure. A chime is due only while its moment is ahead, so a 0-second break is silent and nothing catches up after its moment has passed, such as after a restore.
- `ChimePlayer` schedules the chime on the audio clock, since a background tab's timers are slowed down and the audio clock isn't. It plays nothing before `unlock()`, and a failed file is logged once and not retried. A chime already playing finishes when the schedule changes.
- `RunChimes` reschedules when the run or the chosen chime changes, never on a tick. A volume change only sets the gain, which reaches the chime already scheduled, so it needs no reschedule. **Corrected:** this first said a volume change reschedules too, which the code never did.
- Every button press unlocks the audio, not just Play, since any press is a gesture the browser accepts for audio.
- Only one tab sounds each chime, with a Web Lock. A tab joins the `cadoro-chimes` queue on its first press, so the holder can always play, and the next unlocked tab takes over when it closes. Without Web Locks, or if the lock is refused, every unlocked tab sounds, and a refusal is logged. Letting every tab sound was rejected, since two tabs would play each chime twice.
- A Preview plays in any tab and never takes the lock, since it answers a click in that tab.
- **Changed later:** a chime is placed again when the audio clock stood still, a tab joins the queue only once its audio plays, and leaving the Timer isn't a press, in [the milestone review's fixes](#the-milestone-reviews-fixes).

### The wake lock

- It's asked for while a timer counts, the page is visible and the setting is on, and released on Pause, when the run ends, when the setting is turned off, and when the page is hidden. The browser drops it on a hidden page anyway, so releasing says what's true. It's asked for again when the page is visible.
- **Changed later:** it's also asked for again when the browser lets it go while the page is visible, in [the milestone review's fixes](#the-milestone-reviews-fixes).

### The Settings screen

- The volume saves when the slider is released, not on every step, so dragging doesn't write storage dozens of times. The number shows at once while it's dragged.
- Persistent storage shows On, Off or Unknown, with "Ask again" only while it's Off.
- `lastRoutineId` is saved when a run starts, and the Timer opens on it, falling back to the first pickable routine.
- `TimerSession` gained `onPress` and `onRunStarted`, so the chimes and the saved routine hang off it without it knowing about either.

### Testing the chimes

- Journeys observe the chimes without listening: `AudioContext.currentTime` follows `Date.now()`, so Playwright's fake clock moves the audio clock, and each journey asserts every chime's start moment and file. That checks the schedule, not real playback. A chime on time in a background tab, and the screen staying on during a run on the phone, are device checks.
- Vitest browser runs in parallel worktrees can collide on a port ("Port 63315 already in use"), and running again fixes it.

### The milestone review's fixes

- **A chime never plays late when the audio clock stood still.** The audio clock stops while a laptop sleeps or a phone takes a call, while the wall clock goes on, so a chime placed on it played late by as long as it stood still: asleep from 3 minutes before the target to 20 after, it played 23 minutes late. `ChimePlayer` now keeps the last run and places its chime again from the wall clock (`catchUp`) when the context's `statechange` says it runs again, once an unlock has resumed it, and as the page shows again, which `RunChimes` hears. A chime whose moment has passed is then dropped. A chime whose file loaded late still starts at once within `LATE_CHIME_TOLERANCE_MS`, 1 second, and is dropped after. Catching up leaves a chime that's within 100 ms of its moment alone, so a Preview's unlock doesn't restart it. Checking the clocks on a timer was rejected, since a background tab's timers are slowed down, the reason the audio clock is used at all.
- **The tick checks the chime too.** After a laptop sleeps, a background tab often hears neither `statechange` nor `visibilitychange`, so the holder could still play a chime late: asleep from 3 minutes before the target to 20 after, it played about 3 minutes after waking. The session's `onTick` now has `RunChimes.catchUp()` check the chime on every tick, which leaves one in place alone, so a tick still never reschedules a chime the audio clock keeps on time. A background tab's tick can come a minute apart, but the first after waking comes before such a chime plays. It's an extra check beside the audio clock's scheduling, not a replacement for it.
- **Changed later:** the check runs on a timer of `RunChimes`' own, so it runs on every screen, and `TimerSession` no longer has an `onTick` option.
- **Only a tab whose audio plays takes the chimes' turn.** A tab whose audio couldn't be made or resumed held `cadoro-chimes` and silenced every other tab. `ChimePlayer.unlock()` now says whether the audio plays, and `RunChimes` joins the queue only then. When a later unlock finds the audio can't resume, it lets the lock go, or leaves the queue, and cancels its chime, so the next tab sounds, and it asks again once an unlock works.
- **Leaving the Timer isn't a press.** Leaving called Pause, which fired `onPress`, unlocking the audio and joining the queue in a tab where no button was pressed. `TimerSession.pauseOnLeave()` pauses and saves without calling `onPress`. A flag on `pause` was rejected, since the session's buttons stay one function each.
- **The browser's bars follow the theme.** The `theme-color` meta stayed dark in Light. `ThemeSync` sets it from the shown theme with `THEME_COLOURS`, and `app.html`'s inline script sets it from the theme mirror before the first paint. The manifest's `theme_color` stays dark, the default, since it's one file for every user and can't follow a setting.
- **The wake lock is asked for again when the browser lets it go.** The browser can release it by itself while the page stays visible, such as when the battery saver starts. The keeper listens for the lock's `release` and asks again while the page is visible and a timer counts. A release as the page is hidden isn't asked for again, since the page asks once it's visible.
- **The alerts journeys check each chime's moment against known times.** The steps that checked a chime's moment compared the clock with a moment worked out from the same clock, so they couldn't fail on their own. Each moment is now written out from the paused clock's 9:01 and the routine's target, and the restore journey checks the chime Play schedules for the restored run.
