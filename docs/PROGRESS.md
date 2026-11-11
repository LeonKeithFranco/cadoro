# Progress

**Current status:** The project builds as a static single-page app with `adapter-static`: SvelteKit 3, Svelte 5, strict TypeScript, Tailwind CSS 4 with the forms plugin, Vitest with browser mode, Playwright, ESLint and Prettier. Playwright runs on desktop and phone projects. The npm scripts match the weight tracker's. Milestone 1 is done: every pull request runs the `Checks` job in GitHub Actions, and the `Protect main` ruleset only lets a pull request merge once it passes. Merged branches are deleted automatically.

Milestone 2 is done: both starter routines run through work, overtime, breaks and Finish on the dev server, with nothing saved yet. Step 1 is done: the run engine in `src/lib` is pure TypeScript with unit tests. It covers the routine types and starter routines, time formatting, moving through rounds, blocks and cycles, work time and the earned break, Play, Pause, Next and Finish as a state machine, the view the timer screen will show, and the run summary. Code follows the global style guide in `~/.claude/rules/style-guide.md`.

Step 2 is done: the app shell. A header with the app's name and navigation frames every screen, with a tab bar along the bottom on phones and links in the header from 48rem up, using Lucide icons. Timer, Routines, Stats and Settings are placeholder screens with their own URLs, headings and tab titles. The theme follows `data-theme` on `<html>`, fixed to dark until Settings exists, and every element has light and dark colours. Svelte components are checked for doc comments too. Playwright walks the navigation on desktop and phone.

Step 3 is done: the timer screen runs both starter routines. A shared `TimerSession` in `src/lib/timer.svelte.ts` holds the routines, the chosen routine and the run, so the run survives switching screens, and leaving the Timer screen pauses it. The screen shows the routine picker, the position, a card for each block with its cycle counter and its work and break boxes with progress bars, the overtime look, and Play/Pause, Next and Finish. It updates every second while a timer is counting. `viewBlock` in `src/lib/block-view.ts` works out what each card shows. Component tests drive the screen with a fake clock and faked intervals, and a Playwright journey checks pausing on leaving on desktop and phone.

Step 4 is done: Finish asks "Finish this run?" while the run keeps counting, and a run that ends, by Finish or a finite routine's last work period, shows its summary until Done or Escape readies a new run. Both are native modal dialogs built on a shared `ModalDialog`, and the buttons share their colours through `button-colours.ts`. The Playwright journeys run on a paused fake clock from `e2e/clock.ts`, checking exact times through overtime, a break, the next cycle, Finish and the summary.

Milestone 3, PWA and GitHub Pages, is done: the app is online at Pages, installable and works offline, and a new version offers to reload. Step 1 is done: `BASE_PATH` sets SvelteKit's base path, such as `/cadoro` for Pages, and a third Playwright project, `production`, builds the app at `/cadoro` and checks every screen's link and address there.

Step 2 is done: the production build is installable and works offline. `@vite-pwa/sveltekit` 2.0.2 has Workbox write a service worker that keeps every file and answers every address with the app's page. The app's icon is Lucide's timer on a rose square, made into every size by `npm run generate-icons`. A Playwright journey reloads the production build offline, runs the timer and opens other screens.

Step 3 is done: when a new version is waiting, a card above the tab bar offers Reload and Later. It stays hidden while a run is in progress, and a tab that's mid-run when another tab reloads keeps going until its run ends. Component tests fake the plugin's `useRegisterSW`. A small server in `e2e/update-server.ts` serves the production build with a changed `sw.js` to browsers carrying a cookie, so a new `updates` Playwright project checks real updates, including two tabs.

Before step 4, a `Taskfile.yml` for go-task took over the workflows that took several commands: setup, every CI check in order, flakiness repeats, a production preview, the phone over USB, ports, branches, worktrees, watching CI, reading its failures, and merging. Each task checks what it needs first, and branches and worktrees are only deleted once their commits are on `main`. The README lists the tasks.

Step 4 is done: every push to `main` that passes `Checks` builds the app at `/cadoro` and deploys it to GitHub Pages, with a copy of the fallback page as `404.html`, so a screen's address works on a first visit. The release steps are tasks: `release:bump` on the pull request, then `ci:watch-main`, `pages:check` and `release:publish` on `main` after the merge. The README's Releasing section lists them. 0.1.0 was released, then installed on the desktop and the phone, and works offline on both.

Step 5 is done: Settings shows the app's version, taken from `package.json` through Vite's `define`, and the step is released as 0.2.0, a minor bump for a new feature. Once 0.2.0 was live, the installed 0.1.0 on the desktop and the phone offered to reload and then showed 0.2.0 in Settings, which was milestone 3's last check.

**Next:** milestone 4, Keep runs, starting with planning its steps. Milestone 6 also gains pinned timer controls for long routines, as planned in `docs/DECISIONS.md`.

**Done:** Milestone 3, PWA and GitHub Pages:

1. [x] Base path and a production build test (`build/base-path`)
2. [x] Installable and offline (`feat/offline`): the manifest, an open-licensed icon, and a service worker that keeps the app for offline use, with an offline test on the production build
3. [x] Reload prompt (`feat/update-prompt`): offers to reload when a new version is ready, and never reloads by itself during a run, with Playwright journeys against a server that serves a new version
4. [x] Pages deploy and 0.1.0 (`ci/pages-deploy`): deploying `main` to GitHub Pages with the `404.html` fallback, the release tasks and the README's release steps, and the first release
5. [x] Version in Settings (`feat/app-version`): the version in Settings, released as 0.2.0, and checking that the installed 0.1.0 updates

Decisions and their reasons are in `docs/DECISIONS.md`.

## Milestones

### Phase 1: Pipeline

- [x] 1. Project setup and CI

### Phase 2: Slices

- [x] 2. Run a routine
- [x] 3. PWA and GitHub Pages
- [ ] 4. Keep runs
- [ ] 5. Alerts and Settings
- [ ] 6. Routines
- [ ] 7. Stats
- [ ] 8. Backup and activity log

### Phase 3: Release

- [ ] 9. Release 1.0

### Phase 4: Optional

- [ ] 10. Web Push
- [ ] 11. Container image and homelab
