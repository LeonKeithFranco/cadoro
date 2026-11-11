# Cadoro Plan

## Context

This plan was written when the spec (`docs/SPEC.md`) was finished and before any app code existed, on top of a fresh `sv create` scaffold. It sets the order, tools and working method for building the app, and teaches Svelte 5, SvelteKit and Tailwind CSS along the way, plus browser APIs the weight tracker didn't use, such as Web Audio and Screen Wake Lock. Push notifications, containers and the homelab come in optional milestones after the release.

## How we work

- The work is built in **vertical slices**. Each milestone after the first is one feature that works end to end, from logic to UI to tests, and is usable when it's done. This differs from the weight tracker, which built all the logic before any UI.
- Each slice is cut into **steps**, each on its own branch named after its work, merged through its own pull request. A step is a few rounds of work that leaves the app working.
- Each step is built in **small rounds** of about one commit. Each round makes a small set of changes, explains them and the related concepts, then stops for your questions before continuing.
- Within a step, logic comes before the UI that uses it: a pure function with its unit tests, then the component, then the Playwright journey.
- Every change reaches `main` through a pull request, from the first one. Claude merges, with a rebase merge by default, only when you ask, and once CI exists, only when it passes.
- From the first deploy in milestone 3, every pull request that changes the app bumps the version, and its merged commit is tagged and released.
- A milestone is done when its steps are merged, its concepts have been covered, and `docs/PROGRESS.md` and the milestone's file in `docs/decisions/` are up to date.
- Tests are written after the code, once its behaviour is right, to guard against regressions. A bug fix starts with a regression test that's seen to fail. There are no coverage targets.
- Commands on the homelab, in the optional milestone 11, are yours to run. Claude provides each step and explains it.

## Stack

| Concern                     | Choice                                                | Why                                                                                      |
| --------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Framework                   | SvelteKit 3 with `adapter-static`                     | Learning goal; builds static files for Pages and self-hosting                            |
| UI                          | Svelte 5 with runes, TypeScript (strict)              | Learning goal                                                                            |
| Styling                     | Tailwind CSS 4 and `@tailwindcss/forms`               | Learning goal; the forms plugin makes native form controls easy to style                 |
| UI building blocks          | Native elements                                       | `<dialog>`, `<select>`, range and radio inputs cover every widget, accessible by default |
| Storage                     | Dexie over IndexedDB                                  | Known from the weight tracker, with live queries and schema versions                     |
| Dates                       | date-fns                                              | Plain functions on native dates for local days, Monday weeks and splitting at midnight   |
| Charts                      | LayerChart                                            | Svelte-native SVG charts, composed from components as Recharts was                       |
| Drag and drop               | svelte-dnd-action                                     | Long-standing, with touch, keyboard dragging and screen reader announcements             |
| Audio                       | Web Audio API                                         | Built in; schedules chimes on the audio clock, which background tabs don't throttle      |
| Icons                       | `@lucide/svelte`                                      | The same open-licensed set as the weight tracker                                         |
| PWA                         | `@vite-pwa/sveltekit`                                 | Generates the service worker and manifest, as `vite-plugin-pwa` did                      |
| Unit and component tests    | Vitest, with browser mode and `vitest-browser-svelte` | Component tests run in real Chromium rather than jsdom, so CSS and browser APIs are real |
| End-to-end tests            | Playwright                                            | Known from the weight tracker; its clock API controls time in timer tests                |
| Hosting                     | GitHub Pages                                          | Free, with HTTPS, and anyone can install from it                                         |
| CI/CD                       | GitHub Actions                                        | Checks every pull request and deploys `main`                                             |
| Push (milestone 10)         | A small push server, such as a free Cloudflare Worker | Locked-phone alerts; chosen in that milestone                                            |
| Self-hosting (milestone 11) | Podman, unprivileged nginx, Quadlet, Caddy, Avahi     | As planned for the weight tracker's homelab                                              |

## Before milestone 1

- Merge this docs pull request, which holds the spec, the plan, the progress and decision logs, and the project's `CLAUDE.md`.

## Milestones

The work runs in three phases, plus an optional fourth:

1. **Pipeline:** finish the setup and add CI, so everything after it is checked automatically.
2. **Slices:** each milestone is one usable feature, end to end. The app is online from milestone 3, so each later slice reaches your phone when it merges.
3. **Release:** the README and 1.0.0.
4. **Optional:** push notifications and the homelab, after the release.

## Phase 1: Pipeline

### 1. Project setup and CI

- Pin the Node version in `.nvmrc`, rename the package to `cadoro`, and fix the licence file's name
- Switch to `adapter-static`, with a fallback page so every route works as a single-page app
- Add `@tailwindcss/forms`, and remove the scaffold's example files
- Move Playwright tests to `e2e/`, with desktop and phone projects, and align the npm scripts with the weight tracker's (`test`, `test:watch`, `test:e2e`, `typecheck`, `lint`, `format`, `format:check`)
- Add one placeholder page with a component test and a Playwright test, and a short README
- Add `pipeline.yml` with a `Checks` job that runs lint, formatting, type checks, unit and component tests, the build and Playwright, saving the report and traces when a test fails
- Protect `main` with a ruleset that requires a pull request and a passing `Checks` job

**Learn:** a SvelteKit project's layout (`src/routes`, `+layout.svelte`, `+page.svelte`, `app.html`, `#lib`), SvelteKit config inside `vite.config.ts`, adapters and single-page mode, how Tailwind is wired in and what `@import 'tailwindcss'` and `@plugin` do, Vitest browser mode compared with jsdom, `svelte-check`

## Phase 2: Slices

### 2. Run a routine

The first usable version: run the two starter routines on the dev server, with nothing saved yet.

- Build the run as pure functions: moving through blocks, cycles and rounds; earned break and its rounding; Play, Pause, Next and Finish; the last work period ending the run; the position label; overtime; time formatting. Elapsed and remaining time come from timestamps, with the clock passed in, so tests control time exactly
- Define the two starter routines as constants
- Build the app shell, with navigation between Timer, Routines, Stats and Settings, where the last three are placeholders for now, in the dark theme
- Build the timer screen: the routine picker, each block's work and break boxes, the highlighted active timer and position, the live earned break, the overtime look, and the controls
- Add the Finish confirmation and the run summary as native dialogs

**Learn:** Svelte components and props, runes (`$state`, `$derived`, `$effect`, `$props`), template syntax (`{#if}`, `{#each}` with keys, snippets), events and bindings, Svelte compared with React; Tailwind utilities, spacing and colour scales, responsive and `dark:` variants; modelling a state machine with discriminated unions; injecting a clock; Playwright's clock API

### 3. PWA and GitHub Pages

The app goes online and becomes installable, as version 0.1.0.

- Add the manifest, an icon from an open-licensed set, and a service worker that keeps the whole app for offline use
- Add the reload prompt for new versions, which never reloads by itself during a run
- Take the base path from a build environment variable, so one codebase serves from `/cadoro/` and from `/`
- Deploy to GitHub Pages from `pipeline.yml` after `Checks` passes on `main`, with the fallback page as `404.html`
- Add a Playwright project that builds for production at `/cadoro/` and checks offline use
- Add the release steps to the README and release 0.1.0, then show the version in Settings and release it as 0.2.0
- Check install, offline use and updates on your desktop and phone

**Learn:** SvelteKit's `paths.base` and building links that follow it, how `@vite-pwa/sveltekit` fits SvelteKit's build, semantic versioning in the 0.x range

### 4. Keep runs

Runs survive reloads, and every work period is recorded.

- Define the storage interface, with a Dexie backend for the app and an in-memory one for tests, sharing one test suite
- Create the starter routines in storage on first launch
- Record work periods, with their unpaused segments, and runs
- Save the run in progress, with a heartbeat every second and when the page is hidden, and restore it paused at the last heartbeat on reopening
- Ask for persistent storage after the first work period is saved
- Version the Dexie schema from the start, because the app is already deployed and later milestones change what's stored

**Learn:** loading async data in Svelte, Dexie live queries in Svelte, Svelte's context API, the Page Visibility API and `pagehide`, IndexedDB schema versions and upgrades

### 5. Alerts and Settings

Chimes play on time, the screen stays awake, and Settings has its first options.

- Choose a small set of openly licensed chimes, normalise their loudness, and record each one's source and licence
- Play chimes through Web Audio, unlocked by pressing Play and scheduled on the audio clock, so they're on time in a background tab, and rescheduled on Pause and Next
- Keep the screen awake during a run with the Screen Wake Lock API, asking again when the page becomes visible
- Build Settings: the theme (System, Light or Dark, defaulting to Dark), a chime picker with a preview for each alert, the volume, keeping the screen awake, the persistent storage status and the version

**Learn:** Web Audio (`AudioContext`, decoding, scheduling, browsers' autoplay rules), loudness normalisation, the Screen Wake Lock API, theming with Tailwind's `dark:` variant controlled by a setting

### 6. Routines

Routines can be created, edited, sorted and reordered.

- Build routine validation, every sort order, duplicating and reordering as pure functions
- Build the Routines screen: the list and its sort, a new routine, editing in place one at a time with a prompt before discarding changes, and duplicating and deleting routines
- Build block editing: add, duplicate, delete, Move up and Move down, and dragging with svelte-dnd-action
- Make the timer's picker follow the sort and open on the last routine used, and lock editing during a run
- Keep long routines usable on the timer screen: pin the controls at the bottom with `position: sticky`, and scroll the active block into view when the run moves to one that's out of view
- Record every routine change in the activity log at the storage interface, keeping the newest 5,000 entries, so a failed log write never blocks the change

**Learn:** forms and `bind:` in Svelte, validation messages, keyed lists and the `flip` animation, svelte-dnd-action, warning before leaving with unsaved changes (`beforeNavigate`), `position: sticky`, `scrollIntoView` and `scroll-margin`

### 7. Stats

The Stats screen shows what you've done.

- Build every stat as a pure function with date-fns: splitting work at midnight, daily, weekly and monthly totals, all-time totals per routine, streaks, time against target and targets reached
- Build the Stats screen: today, the daily chart with LayerChart and its range presets, weekly and monthly totals, all time, the streak, the target stats, and the routine filter

**Learn:** date-fns, daylight saving time and why days aren't always 24 hours, LayerChart, accessible charts

### 8. Backup and activity log

Data can be exported, backed up and restored, and errors are recorded.

- Build the CSV export, and the JSON backup and import, with validation, a summary of what the file holds, and replacing all data once confirmed
- Build the activity log page and its JSON export
- Record uncaught errors with a global handler, SvelteKit's error hook and Svelte's error boundaries

**Learn:** `<svelte:boundary>`, SvelteKit's `handleError` hook, validating untrusted JSON

## Phase 3: Release

### 9. Release 1.0

- Write the README as a portfolio piece, covering why the app exists, how it was built with an AI agent, the technical highlights, installing and using the app, the data limitations and self-hosting
- Bump the version to 1.0.0, then tag the merged commit and publish a GitHub release

**Learn:** writing docs for users and self-hosters

## Phase 4: Optional

### 10. Web Push

- Choose and build a small push server, which holds only push subscriptions and due times
- Ask for notification permission, subscribe through the service worker, and schedule, move or cancel a push when a work period starts, pauses or ends
- Show the notification from the service worker, even with the phone locked or the app closed

**Learn:** the Push API, VAPID keys, service worker push events, serverless functions and scheduling, secrets in CI

### 11. Container image and homelab

As planned for the weight tracker: a Podman image with unprivileged nginx, published to `ghcr.io`, then run on the homelab with Quadlet, Caddy and Avahi.

**Learn:** as in the weight tracker's plan, for whichever of the two projects does it first

## Risks

| Risk                                                             | Mitigation                                                                                                   |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| The timer drifts in a background tab, where timers are throttled | Time always comes from timestamps; chimes are scheduled on the audio clock; checked in a real background tab |
| The browser blocks a chime under its autoplay rules              | The audio unlocks on the Play press; a restored run starts paused, so Play unlocks it again                  |
| Chimes are missed on a locked phone                              | Documented; the screen stays awake by default; optional milestone 10 adds Web Push                           |
| Stored data changes shape after the app is deployed              | Dexie schema versions with upgrade functions, each covered by a test                                         |
| The phone kills the app mid-run                                  | A heartbeat every second, and the run restores paused                                                        |
| Learning Svelte and Tailwind at once slows the work              | Small rounds with explanations, and the plain logic is kept apart from both                                  |
| A library such as LayerChart or svelte-dnd-action changes        | Versions fixed by the lockfile; each is used in one place                                                    |
| Other Pages sites on the account can read the app's storage      | Host no untrusted code on the account's Pages                                                                |
| Someone takes a freed username and publishes at the address      | Keep the username, and back up regularly                                                                     |
| GitHub Pages changes its terms or ends                           | Installed copies keep working offline; back up and self-host the built files                                 |
| The Screen Wake Lock API isn't supported                         | The setting says so, and the app works the same                                                              |

## Verification

Every pull request must pass lint, formatting, type checks, tests and the build in CI, from milestone 1. Beyond that:

- **Milestone 1:** a pull request with a deliberately failing test can't be merged.
- **Milestone 2:** you can run both starter routines through work, overtime, break and Finish on the dev server, on the desktop and the phone.
- **Milestone 3:** the app installs from Pages on your phone and desktop, opens in airplane mode, and a merged change reaches the installed copy as a new version.
- **Milestone 4:** reloading, or the phone killing the app, mid-run restores the run paused, with the right times, and the work periods are saved.
- **Milestone 5:** a chime plays on time in a background desktop tab, and the screen stays on during a run on the phone.
- **Milestone 6:** a routine you build, reorder and edit runs exactly as configured.
- **Milestone 7:** the stats match hand-calculated values for synthetic data, including a period across midnight and a daylight saving change.
- **Milestone 8:** a backup from one browser restores into another with everything intact.
- **Milestone 9:** a fresh self-hosted setup following only the README works.
