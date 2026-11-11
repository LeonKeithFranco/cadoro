# Progress

**Current status:** The project builds as a static single-page app with `adapter-static`: SvelteKit 3, Svelte 5, strict TypeScript, Tailwind CSS 4 with the forms plugin, Vitest with browser mode, Playwright, ESLint and Prettier. Playwright runs on desktop and phone projects. The npm scripts match the weight tracker's. Milestone 1 is done: every pull request runs the `Checks` job in GitHub Actions, and the `Protect main` ruleset only lets a pull request merge once it passes. Merged branches are deleted automatically.

Milestone 2 has begun. Step 1 is done: the run engine in `src/lib` is pure TypeScript with unit tests. It covers the routine types and starter routines, time formatting, moving through rounds, blocks and cycles, work time and the earned break, Play, Pause, Next and Finish as a state machine, the view the timer screen will show, and the run summary. Code follows the global style guide in `~/.claude/rules/style-guide.md`.

Step 2 is done: the app shell. A header with the app's name and navigation frames every screen, with a tab bar along the bottom on phones and links in the header from 48rem up, using Lucide icons. Timer, Routines, Stats and Settings are placeholder screens with their own URLs, headings and tab titles. The theme follows `data-theme` on `<html>`, fixed to dark until Settings exists, and every element has light and dark colours. Svelte components are checked for doc comments too. Playwright walks the navigation on desktop and phone.

Step 3, the timer screen, is under way on `feat/timer-screen`, not yet pushed. Its plan has six rounds. Round 1 is done: a break's view keeps the time worked in the period it follows, and `viewBlock` in `src/lib/block-view.ts` works out what each block card shows. The tests' durations are written with `minutes()` and `seconds()` from `src/lib/testing/durations.ts`.

**Next:** Round 2 of step 3, the shared timer session in `src/lib/timer.svelte.ts`, which holds the routines, the chosen routine and the run. Then the picker and block cards, the controls and live timer, a Playwright journey, and the docs.

**In progress:** Milestone 2, run a routine:

1. [x] Run engine (`feat/run-engine`)
2. [x] App shell (`feat/app-shell`): navigation between Timer, Routines, Stats and Settings, with placeholders for the last three, in the dark theme
3. [ ] Timer screen (`feat/timer-screen`): the routine picker, the blocks' work and break boxes, the active timer, the position, the live earned break, the overtime look and the controls
4. [ ] Finish and summary (`feat/run-summary`): the Finish confirmation and run summary as native dialogs, and Playwright journeys with a controlled clock

Decisions and their reasons are in `docs/DECISIONS.md`.

## Milestones

### Phase 1: Pipeline

- [x] 1. Project setup and CI

### Phase 2: Slices

- [ ] 2. Run a routine
- [ ] 3. PWA and GitHub Pages
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
