# Architecture

How Cadoro's code fits together now: where each thing lives, the rules the code keeps, and the concerns that cut across it. The reasons are in `docs/decisions/`, and the details are in each file's doc comments. Update this file when a step changes what it describes.

## Bird's eye view

Cadoro is a static SvelteKit single-page app. GitHub Pages, or any web server, serves the same built files to everyone, and everything happens in the browser.

The code is in layers, each knowing only the one below it:

1. **The run engine** in `src/lib` is plain TypeScript: a run is an immutable value, and every button is a pure function from one run and the current moment to the next run. It never reads the clock or touches the page.
2. **`TimerSession`** keeps the current run in Svelte state, reads the clock, and applies the engine's functions when a button is pressed or the screen ticks.
3. **Components** show views that pure functions work out from the run, such as `viewRun` for the screen and `viewBlock` for each block card, and call the session's methods.
4. **Routes** frame the screens with the header, the navigation and the update prompt.

Nothing is saved yet. Milestone 4 adds storage beneath the session.

## Codemap

### `src/lib`: the logic

- `run.ts`: the run engine. The `RunState` union (ready, working, break, ended), the buttons (`play`, `pause`, `next`, `finish`), moving through rounds, blocks and cycles (`nextPosition`), the position label, work time from segments (`workedMs`), the earned break (`earnedBreakMs`), the view the timer screen shows (`viewRun`) and the run summary (`summarizeRun`).
- `block-view.ts`: `viewBlock`, what each block card shows, worked out from the run's view.
- `routine.ts`: the `Routine` and `Block` types from the spec's data model, and `createStarterRoutines`.
- `time.ts`: unit conversions (`MS_PER_SECOND`, `minutesToMs`) and time formatting (`formatElapsed` rounds down, `formatRemaining` rounds up).
- `percent.ts`: `percentOf` and `asPercentOf`, multiplying before dividing.
- `screens.ts`: `isCurrentScreen`, which link in the navigation is the current one.
- `timer.svelte.ts`: `TimerSession`, and the app's one session, `timerSession`.
- `page-reload.ts`: `reloadPage`, alone in its module so tests can replace it.

### `src/lib/components`: the Svelte components

- `TimerScreen` lays out the Timer screen: `RoutinePicker`, a `BlockCard` per block, `TimerControls`, and the `FinishConfirmation` and `RunSummary` dialogs, both built on `ModalDialog`. It runs the one-second tick and pauses the run when it's removed.
- `ScreenNav` is the navigation, `ScreenHeading` gives each screen its heading and tab title, and `ScreenPlaceholder` stands in for the screens not built yet.
- `UpdatePrompt` registers the service worker and offers to reload when a new version is waiting.
- `button-colours.ts` holds the main and outlined buttons' Tailwind classes, which every screen and dialog shares.

### `src/routes`: the screens

- `+layout.ts` turns off server-side rendering, so the app renders only in the browser.
- `+layout.svelte` is the frame: the global styles from `layout.css`, the header, the navigation and `UpdatePrompt`.
- `+page.svelte` is the Timer screen. `routines/`, `stats/` and `settings/` hold the other screens. Settings shows the app's version.

### Tests and their helpers

- Unit tests sit beside their module as `*.test.ts`, and component tests beside their component as `*.svelte.test.ts`.
- `src/lib/testing/` holds test helpers: `durations.ts` (`seconds`, `minutes`, `hours`), `ids.ts` (`numberedIds`), `routines.ts` (`oneRoundRoutine`) and `run-summary.ts` (`shownTotals`).
- `e2e/` holds the Playwright journeys (`*.spec.ts`), with `clock.ts` (`openOnPausedClock`, `followLink`), `service-worker.ts` (`waitForActiveWorker`), and `update-server.ts`, which serves the production build with a new service worker to browsers that ask. `e2e/production/` holds the journeys against the production build.

### Config and tooling

- `vite.config.ts`: SvelteKit's config inside `withPwa`, with the base path from `BASE_PATH`, the PWA plugin's service worker and manifest, `__APP_VERSION__` from `package.json`, and Vitest's two test projects.
- `dev-server.ts`: the dev server's port from `PORT`, shared by Vite and Playwright.
- `playwright.config.ts`: the four Playwright projects and the three servers they test.
- `eslint.config.js`: the lint rules, including the doc comment checks. `prettier.config.js` formats every file.
- `pwa-assets.config.ts` and `static/`: the icons, made from `static/favicon.svg` by `npm run generate-icons`.
- `Taskfile.yml`: go-task tasks for the workflows that take several commands. The README lists them.
- `.github/workflows/pipeline.yml`: CI's `Checks` job, then the Pages build and deploy on `main`.

## Invariants

- Time comes from saved timestamps, never from counting ticks. The engine takes `now` as an argument, and the session takes its clock as a parameter, so tests control time exactly.
- The engine's runs are immutable. Each button returns a new run or the same one, and a button that does nothing in the current state returns the run unchanged rather than throwing.
- Nothing in the engine or the view functions reads the clock, the page or Svelte. Svelte appears only in `.svelte` and `.svelte.ts` files.
- Work time is kept to the millisecond. Only the earned break is rounded, once, to whole seconds, when the break starts.
- Every link and asset address goes through SvelteKit's `resolve()` or `%sveltekit.assets%`, so the app works under a base path such as `/cadoro`.
- Data will go only through the storage interface, from milestone 4.

## Cross-cutting concerns

### State in Svelte

- `TimerSession` keeps its fields in JavaScript's `#private` fields, so only its methods can change the run.
- The run is held in `$state.raw`, because the engine replaces it whole. The view is `$derived` from the run and the last tick's moment.
- An effect that should restart only when something changes reads a `$derived` of that thing, such as `isRunning`, not a value that changes on every tick.
- State about a screen rather than the run, such as whether Finish is asking, is the screen's own `$state`.

### Styling and themes

- Tailwind classes only, with `@tailwindcss/forms` styling native controls. Native elements cover every widget, such as `<dialog>` and `<select>`.
- The `dark:` variant follows `data-theme` on `<html>`, fixed to `dark` until Settings can change it. Every element carries both its light and its dark colours.
- Rose is the accent and amber means overtime, and colour never carries meaning alone. Text keeps at least 5:1 contrast, and outlines and bars at least 3:1, in both themes.
- The layout is one centred column up to `max-w-3xl`, with a bottom tab bar on phones and header links from `md` (48rem).

### Testing

- Vitest's `server` project runs `*.test.ts` in Node, and its `client` project runs `*.svelte.test.ts` in Chromium through browser mode.
- Component tests find elements by role and label. The timer's tests drive the session with a fake clock and fake only `setInterval` and `clearInterval`, and the update prompt's replace the PWA plugin's module with `vi.mock`.
- Tests write times as `minutes(25)`, not `25 * 60_000`, and keep their data visible rather than importing it from the code they check.
- Playwright's projects are `desktop` and `phone` against the dev server (`PORT`, 5173 by default), `production` against a build at `/cadoro` on port 4175, and `updates` against the update server on port 4176.
- Journeys that run the timer start on a paused fake clock with `openOnPausedClock`, move it with `fastForward`, and follow links with `followLink`, since SvelteKit waits on a timer before navigating.

### Docs and lint

- Every module-level declaration, type, field and prop has a TSDoc comment, checked by ESLint with `eslint-plugin-tsdoc` and `eslint-plugin-jsdoc`. Each component starts with a `<!-- @component -->` comment. Variables made with `$state`, `$derived` or `$props` are exempt.
- `npm run typecheck` fails on any Svelte warning.

### Builds, deploys and releases

- The build is `adapter-static` with an `index.html` fallback, and nothing is prerendered. Workbox's service worker keeps every file and answers every address with the fallback page, so the app works offline.
- A new version waits until the user reloads, and the prompt stays hidden during a run.
- CI runs the checks on every pull request, in Playwright's container image. A push to `main` that passes deploys to GitHub Pages, with a copy of the fallback page as `404.html`.
- Releases follow the README's Releasing section: `task release:bump` on the pull request, then `ci:watch-main`, `pages:check` and `release:publish` after the merge.
