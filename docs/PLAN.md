# Cadoro Plan

## Context

The spec (`docs/SPEC.md`) was finished before any app code existed. Milestones 1 to 3 and most of 4 were built as a teaching project, in small rounds with explanations. On 2026-11-19 the user decided to finish the app to 1.0.0 with as little of their time as possible, so this plan is now the approved plan for every remaining milestone, and the work runs autonomously as "How we work" says. Push notifications, containers and the homelab stay optional, outside this run.

## How we work

### Rules

- The work is built in vertical slices: each milestone is one feature that works end to end, from logic to UI to tests.
- One branch and one pull request per milestone, each with one version bump and release. Branches are named after the work, such as `feat/routines`.
- Within a milestone, logic and storage come before the components that use them, and the Playwright journeys come last.
- Tests are written after the code, once its behaviour is right. A bug fix starts with a regression test that's seen to fail. Every rule, edge case, journey and failure gets a test. There are no coverage targets.
- Docs are lean: SPEC, PROGRESS and ARCHITECTURE are kept true and updated once per milestone. The decision log gets short bullets, only for decisions the spec and this plan don't already hold.
- Decide open questions with the conventional option that fits the spec, note it, and carry on.
- Merging: Claude runs `task pr:merge` once CI is green and the review is settled. The `ask` rule stays, so the user's approval of its prompt is the sign-off. Never work around the prompt.
- Device checks go in each release summary and are never waited on.
- Commands on the homelab, in the optional milestone 11, are the user's to run.

### Roles and models

Opus orchestrates and subagents implement. The main session writes no code, tests or docs itself, because its context is re-read on every turn and keeping file contents and diffs out of it is the biggest token saving. Writers work one at a time in the main checkout, on the milestone's branch. Only read-only agents run in parallel.

| Job                                                                                                                 | Who                                                         | Notes                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Orchestrate: cut briefs, triage review findings, run the git, check, CI and release tasks                           | Opus (main session)                                         | Doesn't read the files it delegates. Works from the SPEC's headings, ARCHITECTURE's codemap and the subagents' reports. |
| Almost all implementation: logic, storage, components, tests, journeys, lint and type fixes, docs, memory, settings | Sonnet subagent (`general-purpose`, `model: sonnet`)        | One work package at a time. Continue the same agent with SendMessage for follow-up fixes in the same package.           |
| The two hard cores                                                                                                  | Opus subagent (`general-purpose`, `model: opus`)            | The shared-run session and storage (milestone 4) and the chime scheduler (milestone 5).                                 |
| Lookups: "where is X used", summarising a failed CI log                                                             | Haiku (`Explore`, `model: haiku`)                           | Only when a direct `grep`, or `task ci:logs` piped through `tail`, wouldn't do.                                         |
| Milestone review                                                                                                    | Opus subagent (`general-purpose`, `model: opus`), fresh one | Once per milestone, never the agent that wrote the code.                                                                |

Don't set an `effort` on subagents. No agent teams and no workflows. The only worktrees are the stacked worktree in "Overlapping milestones" and one a hotfix needs.

### A work package brief

Each brief gives the goal in two or three sentences, the SPEC sections by heading, the files to create or change, the existing functions to reuse by path, any design already settled, and this definition of done:

- `go-task check:quick` passes.
- Every rule, edge case and failure in the package has a test, found by role and label in component and Playwright tests. For each new rule, break the code once, see the test fail, and restore it.
- Every declaration, type, field and prop has a true TSDoc comment. Signatures are fully typed.
- Conventional Commits, small and logical, each staging only the files the package touched (`git add <files>`, never `git add -A`).
- Never skip, delete or loosen an existing test or a check to get to green. If an existing test seems wrong, stop and report it.
- Report back in under 150 words: commits made, decisions taken that the spec didn't settle, anything unfinished.

### The milestone loop

1. `go-task branch:new BRANCH=<branch>`. Read the milestone's SPEC sections and the current milestone's file in `docs/decisions/`.
2. Run the work packages in order.
3. Visual check of new or changed screens: a Sonnet agent follows the visual-checks recipe (`PORT=5199` dev server, light and dark at 1280, 800 and Pixel 7), compares against the existing screens, and fixes what's off.
4. Docs round (Sonnet): SPEC for any behaviour decided along the way, PROGRESS, ARCHITECTURE, short decision-log bullets built from the packages' reports, and the README when tasks, credits or usage changed.
5. `go-task release:bump LEVEL=<level>`, `go-task check`, push, and open the pull request. Its description lists what was built, decisions taken, guardrail files changed (or "none"), tests removed or changed (or "none"), and device checks for the user.
6. In parallel: `go-task ci:watch` in the background, and the reviewer.
7. Triage the review. Fix real bugs, spec mismatches and missing tests, not style or hypotheticals. Re-check only the fixed hunks, with the same reviewer through SendMessage.
8. When CI is green and the review is settled, run `go-task pr:merge`, which prompts the user. Wait.
9. After the merge: `go-task ci:watch-main` in the background, then `go-task pages:check`, then `go-task release:publish`.
10. Print a summary of at most 15 lines: what's live, decisions taken, device checks to try. Go straight on to the next milestone.

### Overlapping milestones

The user decided on 2026-11-19 that the next milestone starts while the current one waits on CI, the review, the merge prompt and the release.

- Once the pull request is open (loop step 5), make a worktree stacked on its branch: `go-task worktree:new NAME=<name> BRANCH=<next branch> BASE=origin/<current branch>`. It lands in `../pomodoro-worktrees/<name>`, set up.
- The open pull request's review fixes stay in the checkout that holds its branch. The next milestone's writers work only in the worktree, by absolute path, and never touch the other checkout.
- Give the worktree its own port, such as `PORT=5174 go-task check`, and run Playwright in one checkout at a time.
- Briefs for agents in a worktree tell them to read `~/.claude/rules/docs-typescript.md` and `~/.claude/rules/style-guide.md`, since rules scoped by `paths` load only in the primary checkout. They also say not to edit the guardrail files and to report instead, since `.claude/settings.json`'s ask rules may not cover the worktree's paths.
- Before `go-task pr:merge`, which deletes the branch, note the commit the worktree branched from: `git -C <worktree> merge-base HEAD origin/<current branch>`. It isn't the branch's tip once review fixes land after the worktree is made. The rebase merge rewrites the stacked commits, so afterwards, in the worktree, run `git fetch origin` and `git rebase --onto origin/main <that SHA>`. Then run `go-task check:quick` there.
- The worktree then carries its milestone through to its own pull request, and the next milestone stacks on it the same way. Remove each worktree with `go-task worktree:done NAME=<name>` once its branch is merged.
- Packages that only add new files may start early, in worktrees from `main` on their milestone's own branch. At 0.5.1 these were `stats`, `routines` and `alerts`, for milestone 7's pure logic, milestone 6's pure logic and milestone 5's chime files. Early agents don't touch storage, the session, config or docs, and run only `check:quick`.
- Storage changes still go in milestone order, because each Dexie version builds on the last.
- If a session restarts mid-overlap, `git worktree list` shows the open worktrees, and each branch's `git log origin/main..` shows its own commits.

### The reviewer's brief

Read-only. Give the reviewer `git diff main...HEAD`, the milestone's SPEC sections, and the invariants in `docs/ARCHITECTURE.md`. Ask for findings ranked by severity, each with file, line and a concrete failing scenario, and no style comments. It checks:

- Bugs and behaviour that differs from the SPEC.
- Rules, edge cases or failures with no test, and tests that can't fail.
- Any test deleted, skipped or loosened, from `git diff main...HEAD -- '*.test.ts' '*.spec.ts'`.
- Any change to a guardrail file: `eslint.config.js`, `tsconfig.json`, `.github/workflows/**`, `playwright.config.ts`, `vite.config.ts`'s test projects, `Taskfile.yml`'s check tasks, `.claude/settings.json`.
- Any change to what's stored without a new Dexie version, an upgrade and an upgrade test.
- Doc comments that are false against the code.

### Stop rules

The run stops and reports only for:

- The merge prompt, a guardrail-edit prompt, or an install prompt for a package this plan doesn't name.
- The same failure surviving three fix attempts (a check, a CI job, a flaky journey). Report what was tried. Never raise a timeout, add a retry or skip a test to get past it.
- A deploy to Pages failing twice, or `pages:check` failing after a deploy.
- Anything that would delete or rewrite the user's stored data outside a tested Dexie upgrade.

Everything else: decide and note.

### Token rules

- Pipe long output through `tail` or `grep`, with `set -o pipefail` so a failure still fails.
- CI watches and dev servers run in the background, with no wait loops. Stop servers with TaskStop.
- Subagent reports stay under 150 words, and milestone summaries under 15 lines.
- Docs are written once per milestone, not per package.
- No explanations of concepts, anywhere.

## Stack

| Concern                     | Choice                                                | Why                                                                                      |
| --------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Framework                   | SvelteKit 3 with `adapter-static`                     | Builds static files for Pages and self-hosting                                           |
| UI                          | Svelte 5 with runes, TypeScript (strict)              | The project's chosen framework                                                           |
| Styling                     | Tailwind CSS 4 and `@tailwindcss/forms`               | The forms plugin makes native form controls easy to style                                |
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

## Milestones

The work runs in three phases, plus an optional fourth:

1. **Pipeline:** the setup and CI, so everything after it is checked automatically.
2. **Slices:** each milestone is one usable feature, end to end. The app is online from milestone 3, so each later slice reaches the phone when it merges.
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

## Phase 2: Slices

### 2. Run a routine

The first usable version: run the two starter routines on the dev server, with nothing saved yet.

- Build the run as pure functions: moving through blocks, cycles and rounds; earned break and its rounding; Play, Pause, Next and Finish; the last work period ending the run; the position label; overtime; time formatting. Elapsed and remaining time come from timestamps, with the clock passed in, so tests control time exactly
- Define the two starter routines as constants
- Build the app shell, with navigation between Timer, Routines, Stats and Settings, where the last three are placeholders for now, in the dark theme
- Build the timer screen: the routine picker, each block's work and break boxes, the highlighted active timer and position, the live earned break, the overtime look, and the controls
- Add the Finish confirmation and the run summary as native dialogs

### 3. PWA and GitHub Pages

The app goes online and becomes installable, as version 0.1.0.

- Add the manifest, an icon from an open-licensed set, and a service worker that keeps the whole app for offline use
- Add the reload prompt for new versions, which never reloads by itself during a run
- Take the base path from a build environment variable, so one codebase serves from `/cadoro/` and from `/`
- Deploy to GitHub Pages from `pipeline.yml` after `Checks` passes on `main`, with the fallback page as `404.html`
- Add a Playwright project that builds for production at `/cadoro/` and checks offline use
- Add the release steps to the README and release 0.1.0, then show the version in Settings and release it as 0.2.0

### 0. Guardrails and the new workflow

Branch `build/agent-guardrails`, released as 0.5.1. Added before the remaining milestones, so the autonomous run is checked mechanically.

- Install the packages the remaining milestones need, in one command
- Lint and type guardrails: explicit return types, typed promise rules, the Vitest and Playwright test plugins, inline ESLint configuration banned, and `noUncheckedIndexedAccess`
- A checked-in `.claude/settings.json` that asks before edits to the guardrail files
- This plan's workflow, and the matching `CLAUDE.md`, memory and docs

### 4. Keep runs

Runs survive reloads, every work period is recorded, and every open tab shows the same run. Steps 1 to 3 are released (0.3.0 to 0.5.0): storage with its Dexie and in-memory backends, the records of runs and work periods, and the run in progress saved and restored paused.

#### Last step: share the run across tabs

Branch `feat/shared-run`, 0.6.0. An Opus subagent writes the session and storage changes with their tests. Sonnet writes the journey and the docs.

- `CadoroStorage` gains a way to watch the run in progress, backed by Dexie's `liveQuery` in `DexieStorage` and by plain subscribers in `InMemoryStorage`. The shared suite in `storage.browser.test.ts` covers both.
- `TimerSession` (`src/lib/timer.svelte.ts`) follows the saved run: a change from another tab replaces its run without being saved again.
- Three hazards to design against and test:
  - **A stale tab overwriting a press.** A heartbeat must never write a whole run. Storage gets a heartbeat-only write, and a press's save is conditional on the row it was computed from (a revision counter), inside one transaction. A refused press takes the newer run instead.
  - **A new tab pausing a live run.** Opening the app restores the run paused at its heartbeat, and a second tab must not do that while another tab is alive. Heartbeats can be a minute stale in a hidden tab, so liveness can't come from the heartbeat's age. Hold a Web Lock for the tab's lifetime and check `navigator.locks.query()` at startup, or settle an equivalent.
  - **Work recorded once.** Each work period and run is saved by the tab that made the press, and only by it.
- A revision field changes what's stored, so it needs Dexie version 2 with an upgrade and an upgrade test.
- Journey `e2e/shared-run.spec.ts`, two pages in one context, as the update journeys do: a press in one shows in the other; work periods are saved once (`e2e/storage.ts`'s `savedWorkPeriods`); a second tab opened mid-run joins without pausing it; closing every tab and reopening still restores paused.
- Docs: ARCHITECTURE's bird's eye view and invariants, which say each tab keeps its own session.

### 5. Alerts and Settings

Branch `feat/alerts-and-settings`, 0.7.0. SPEC: Alerts, Keeping the screen awake, Settings, Persistent storage, the `Settings` type.

1. **Settings in storage (Sonnet).** The `Settings` type with the spec's defaults, a `settings` table (a new Dexie version with an upgrade and test), `getSettings` and `saveSettings` on `CadoroStorage`, watched like the run so every tab follows a change.
2. **Theme (Sonnet).** System, Light and Dark through `data-theme` on `<html>`, defaulting to Dark. Avoid a flash of the wrong theme on load, and note how.
3. **Chimes (Sonnet for the files, an Opus subagent for the scheduler).**
   - Find 3 to 5 chime recordings under CC0 or an equally open licence. Verify each licence on its source page. Put them in `static/chimes/`, and record each source and licence in the README's Credits and beside the files. `ffmpeg` and `sox` aren't installed, so normalise loudness in a container through the `containers` skill.
   - If a file can't be downloaded or its licence can't be verified, synthesise 3 to 5 chimes with Web Audio instead, at matched loudness, and note it. Don't mix unverified files in.
   - Add the audio files to the service worker's precache in `vite.config.ts`, so chimes work offline.
   - A pure function works out when chimes are due from the run and the moment (target reached, break over). A thin Web Audio player unlocks on the Play press and schedules on the audio clock, rescheduling on Pause, Next, Finish, a restore and another tab's change.
   - With shared tabs, only one tab may sound each chime. Settle how (a Web Lock is the natural fit) and test it.
4. **Screen wake lock (Sonnet).** Asked for during a run, again when the page becomes visible, off when the setting is off. Where unsupported, the setting says so.
5. **Settings screen (Sonnet).** Theme, a chime picker and preview for each alert, volume, keep the screen awake, persistent storage status with a button to ask again, the version. `lastRoutineId` saved when a run starts, and the Timer opening on it.
6. **Journeys (Sonnet).** A target reached and a break ending each trigger their chime, observed through the player rather than the speakers; settings survive a reload; the theme changes the page; Pause moves a scheduled chime.

Device checks: a chime on time in a background desktop tab; the phone's screen staying on during a run.

### 6. Routines

Branch `feat/routines`, 0.8.0. SPEC: Routines and blocks, Routines screen, Editing a routine, The timer screen, Activity log (changes).

1. **Pure logic (Sonnet).** Validation against the data model's limits, the seven sort orders, duplicating a routine and a block, reordering, a new routine's defaults, and the single-block rule that resets cycles to 1.
2. **Storage (Sonnet).** Create, save, soft-delete (`deletedAt`) and reorder routines; what "last used" and "most work" need from runs and work periods; refusing to delete the last routine. Every routine change is written to a `log` table at the storage interface, with old and new values, keeping the newest 5,000, and a failed log write never blocks the change. New Dexie version, upgrade and test. Routines are watched, so the Timer and other tabs follow an edit.
3. **Routines screen (Sonnet).** The list and its remembered sort; "+ New routine"; editing in place, one at a time, with "Discard changes?" on opening another or leaving (`beforeNavigate`); Duplicate; Delete with confirmation, disabled on the last routine with a hint; Move up and Move down; drag handles with svelte-dnd-action, shown only in custom order.
4. **Block editing (Sonnet).** Add, duplicate, delete with confirmation (disabled on the last block), Move up and Move down, drag handles, the disabled cycles field with its hint.
5. **Timer changes (Sonnet).** The picker follows the sort. The running routine can't be edited or deleted. The controls are pinned with `position: sticky`, and the active block scrolls into view, as planned in `docs/decisions/03-pwa-and-github-pages.md`.
6. **Journeys (Sonnet).** Create, edit, reorder and delete a routine; build a multi-block routine and run it exactly as configured; the discard prompt; the last routine can't be deleted.

### 7. Stats

Branch `feat/stats`, 0.9.0. SPEC: Stats.

1. **Pure logic with date-fns (Sonnet).** Splitting segments at local midnight; daily, weekly (Monday) and monthly totals; all-time totals per routine, deleted ones included; current and longest streak, with today kept alive; time against target; targets reached; the range presets; the routine filter. Tests pin the time zone and include a period across midnight and across a daylight saving change, checked against hand-calculated values.
2. **Stats screen (Sonnet).** Today, the daily chart with LayerChart and its presets, weekly and monthly totals, all time, the streak, the target stats and the routine filter. The chart needs a text alternative that a screen reader can use. An empty state for no work yet.
3. **Journeys (Sonnet).** Run a routine on the fake clock and see its work in Stats; the filter; the presets.

### 8. Backup and activity log

Branch `feat/backup-and-log`, 0.10.0. SPEC: Export and import, Activity log, Settings.

1. **Export and import logic (Sonnet).** The CSV of work periods; the JSON backup of routines, runs, work periods and settings, with a format version; validation that rejects an invalid file whole; the summary of what a file holds.
2. **Storage (Sonnet).** Reading everything for a backup, and replacing everything in one transaction on import. The import is logged. Reading log entries newest first.
3. **Settings additions (Sonnet).** CSV export, JSON backup, import with its summary and confirmation, and the activity log page under Settings with its JSON export.
4. **Errors (Sonnet).** Uncaught errors recorded by a global handler, SvelteKit's `handleError` and a `<svelte:boundary>`. The existing `console.error` calls for failed saves become log entries.
5. **Journeys (Sonnet).** Back up in one browser context and restore into a fresh one with everything intact; an invalid file changes nothing; the log shows a routine edit.

## Phase 3: Release

### 9. Release 1.0

Branch `docs/release-1-0`, 1.0.0 (`LEVEL=major`).

1. **Spec sweep (Sonnet, read-only, then fixes).** Walk `docs/SPEC.md` feature by feature against the app and its tests, and list every gap. Fix each with its test.
2. **Accessibility and polish pass (Sonnet).** Keyboard use of every screen, focus order in dialogs, contrast at the levels ARCHITECTURE states, both themes, phone and desktop.
3. **README (Sonnet).** Practical: what the app is, installing and using it, the data limitations from the spec, self-hosting, development, tasks, releasing, credits. No build story.
4. **Self-host check.** Build with no base path, serve the files from a plain static server with a fallback page, and follow only the README.
5. **Node.** Move `.nvmrc` and `@types/node` from Node 22 to the current LTS in its own commit. If it breaks CI in a way that isn't a quick fix, revert it and leave the item open.
6. Final summary: every decision taken during the run, and one device checklist covering all milestones.

## Phase 4: Optional

### 10. Web Push

- Choose and build a small push server, which holds only push subscriptions and due times
- Ask for notification permission, subscribe through the service worker, and schedule, move or cancel a push when a work period starts, pauses or ends
- Show the notification from the service worker, even with the phone locked or the app closed

### 11. Container image and homelab

As planned for the weight tracker: a Podman image with unprivileged nginx, published to `ghcr.io`, then run on the homelab with Quadlet, Caddy and Avahi.

## Risks

| Risk                                                             | Mitigation                                                                                                   |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| The timer drifts in a background tab, where timers are throttled | Time always comes from timestamps; chimes are scheduled on the audio clock; checked in a real background tab |
| The browser blocks a chime under its autoplay rules              | The audio unlocks on the Play press; a restored run starts paused, so Play unlocks it again                  |
| Chimes are missed on a locked phone                              | Documented; the screen stays awake by default; optional milestone 10 adds Web Push                           |
| Stored data changes shape after the app is deployed              | Dexie schema versions with upgrade functions, each covered by a test                                         |
| The phone kills the app mid-run                                  | A heartbeat every second, and the run restores paused                                                        |
| An autonomous run weakens its own checks or tests                | Guardrail files prompt before edits; the reviewer checks guardrail and test diffs; stop rules                |
| A library such as LayerChart or svelte-dnd-action changes        | Versions fixed by the lockfile; each is used in one place                                                    |
| Other Pages sites on the account can read the app's storage      | Host no untrusted code on the account's Pages                                                                |
| Someone takes a freed username and publishes at the address      | Keep the username, and back up regularly                                                                     |
| GitHub Pages changes its terms or ends                           | Installed copies keep working offline; back up and self-host the built files                                 |
| The Screen Wake Lock API isn't supported                         | The setting says so, and the app works the same                                                              |

## Verification

Every pull request must pass lint, formatting, type checks, tests and the build in CI, and have its review settled. Beyond that:

- **Milestone 0:** each new lint rule and the `ask` rule shown to fire on a broken example, and `go-task check` passes with all of them on.
- **Milestone 1:** a pull request with a deliberately failing test can't be merged.
- **Milestone 2:** you can run both starter routines through work, overtime, break and Finish on the dev server, on the desktop and the phone.
- **Milestone 3:** the app installs from Pages on your phone and desktop, opens in airplane mode, and a merged change reaches the installed copy as a new version.
- **Milestone 4:** reloading, or the phone killing the app, mid-run restores the run paused, with the right times, and the work periods are saved. Two tabs show the same run, and record its work once.
- **Milestone 5:** the chime journeys pass. A chime plays on time in a background desktop tab, and the screen stays on during a run on the phone (device checks).
- **Milestone 6:** a routine you build, reorder and edit runs exactly as configured.
- **Milestone 7:** the stats match hand-calculated values for synthetic data, including a period across midnight and a daylight saving change.
- **Milestone 8:** a backup from one browser restores into another with everything intact.
- **Milestone 9:** the spec sweep finds no gap, and a fresh self-hosted setup following only the README works.
