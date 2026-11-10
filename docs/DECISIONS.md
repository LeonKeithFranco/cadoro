# Decisions

Changes to the spec, plan and design, newest day first, each with its reason and often the options that were rejected.

## 2026-11-10

**Doc comments**

- TypeScript files are checked for TSDoc comments with `eslint-plugin-tsdoc` and `eslint-plugin-jsdoc`, configured as in the weight tracker: a comment on every module-level declaration, type and field, and `@param` and `@returns` on every function. It came in its own pull request before the run engine, so the engine is checked from its first line, rather than as the first commit of that step.
- JavaScript files, such as `prettier.config.js`, aren't checked, because they give values types with JSDoc tags such as `@type`, which TSDoc doesn't have.
- Svelte components aren't checked yet. Requiring a comment on every module-level variable would mean commenting every `$state` in a component's script, so how the rules fit `.svelte` files is decided once the first real component exists.

**Routines and the position label**

- The position label leaves out any part whose total is 1, because it never changes during a run. Classic shows just "Round 5" rather than "Round 5 · Block 1 of 1 · Cycle 1 of 1", which matches the spec's own "Round 5" example. A routine's label keeps the same parts for the whole run, since its totals don't change mid-run. Showing all three parts on every routine was rejected as noise, and always showing the round was rejected because a one-round routine's "Round 1 of 1" never changes either. A routine of one round, one block and one cycle has an empty label.
- A routine with one block has 1 cycle, because with one block cycles and rounds do the same job: 3 cycles of 2 rounds is the same run as 6 rounds, and an infinite routine's cycles mean nothing. The editor shows the field disabled at 1 with a hint, rather than hiding it, so the form keeps its layout and says why. Deleting blocks down to one resets the remaining block's cycles to 1, and rounds stay as they were. Folding the cycles into rounds, to keep the run the same length, was rejected because it changes a field the user didn't touch. The run engine still handles any number of cycles, and validation enforces the rule in the editor and on import.

## 2026-11-09

The spec and plan were worked out in conversation, starting from the user's sketch of the timer screen. Milestone 1's setup and CI were done the same day.

**CI**

- `pipeline.yml` has one `Checks` job for now, running each npm script as its own step, cheapest first: lint, formatting, types, unit and component tests, the build, then the Playwright tests. The Pages jobs come in milestone 3.
- The `Checks` job runs inside Playwright's container image, which has Chromium and its system packages built in, because component tests need the browser as well as the Playwright tests. The browser was first installed with the Playwright CLI and `--with-deps`, but in two of the first four runs that step took about three minutes, fetching Chromium's fonts with `apt` from a slow Ubuntu mirror, while the tests took about 15 seconds. Caching the browser was rejected because it only saves the browser's download of about 8 seconds, and the `apt` packages can't sensibly be cached. Skipping `--with-deps` and relying on the libraries GitHub's runner happens to have was rejected as fragile. Playwright's GitHub Action is archived. The image's tag must match the locked Playwright version, so the two are bumped together.
- The `Protect main` ruleset matches the weight tracker's. It blocks deleting and force-pushing `main`, requires a pull request with no approvals, because GitHub doesn't let you approve your own pull request, and requires the `Checks` job as reported by GitHub Actions. Branches don't need to be up to date with `main` before merging, because a pull request's run already tests it merged with `main`. Nobody can bypass it, the admin included.
- GitHub deletes a pull request's branch once it merges.
- The check that a failing test blocks a merge used a throwaway draft pull request with a broken component test, closed without merging. It was based on the workflow's branch, because `main` had no workflow yet.

**Project setup**

- The build is a single-page app: `adapter-static` with an `index.html` fallback, and SSR turned off in the root layout. Nothing is prerendered, because the data lives in the browser, so the fallback page starts the app for every route. `index.html` was chosen over the adapter's usual `200.html` because static servers serve it at `/` without extra setup. The adapter warns against it only when the homepage is also prerendered. Milestone 3 copies it to `404.html` for Pages.
- Vitest files end in `.test.ts` and Playwright files in `.spec.ts`, as in the weight tracker, rather than the scaffold's Vitest accepting both. Component tests end in `.svelte.test.ts` and run in Chromium, and the rest run in Node.
- The npm scripts use the weight tracker's names, each doing one job, so each CI step shows exactly which check failed.
- `npm run typecheck` runs svelte-check with `--fail-on-warnings`, so Svelte's accessibility and compiler warnings fail the checks rather than piling up. A justified exception is silenced where it occurs with a `svelte-ignore` comment.
- Playwright runs a desktop project (Desktop Chrome) and a phone project (Pixel 7) against the dev server, which starts quickly. A project against a production build comes with the service worker in milestone 3.
- The forms plugin keeps its default `base` strategy, which styles every native control, rather than the `class` strategy, because all of the app's controls should share one look.
- npm's audit warnings stay visible. All 14 are in development tools, with none in what ships (`npm audit --omit=dev`). npm can't ignore single advisories, and `npm audit fix --force` would downgrade to ancient versions. Turning off the audit on install was rejected because it would also hide warnings that matter.
- Editor settings folders, `.vscode` and `.zed`, stay out of git, since editor setup is personal.

**The timer model**

- The app is built from routines made of blocks, rather than the classic fixed Pomodoro. The classic routine, with its long break after four cycles, is just one routine: two blocks, 25 minutes at 20% three times, then 25 minutes at 60% once. Both ship as starter routines.
- Work counts up past its target, rather than counting down, so a focused stretch is never cut off. The target plays a chime and changes the timer's look, and work moves to a break only when the user presses Next.
- A break is a percentage of the time actually worked, not a fixed length or a ratio. The sketch first described ratios such as 5:1, but a percentage of work time states the earned-break idea directly and avoids awkward ratios. Percentages are whole numbers from 1 to 100, with no cap or minimum on the break earned.
- The earned break is rounded once, to the nearest whole second, with ordinary half-up rounding. Banker's rounding was considered, but it only matters when many rounded values are added up, and breaks are never summed. Work time keeps full precision.
- Skip was merged into Next, which ends a work period and starts its break, or ends a break early. Unused break is lost. Banking it is an open item, to revisit after using the app.
- Reset was replaced by Finish, which confirms, then ends the run and keeps the work done in stats, because the two did the same job. Finish is also how an infinite routine ends.
- A finite routine ends when its last work period ends, without the last break, which would serve no purpose.
- A routine repeats in **rounds** and a block in **cycles**, so the timer can say "Round 2 of 4 · Block 2 of 3 · Cycle 1 of 3" without two meanings of "cycle".
- Limits catch typos and keep the layout sane rather than restricting use: targets 1–240 minutes, cycles and rounds 1–99, up to 20 blocks, and titles up to 50 characters. Count-up work means the target cap never limits actual work.

**Leaving and returning**

- A run interrupted by closing, reloading or the phone killing the app restores paused at its last heartbeat, so time away never counts as work. The heartbeat runs every second. Every 5 seconds was proposed first, but every second costs nothing noticeable: it overwrites one small record, the display already updates every second, and the app also saves when the page is hidden.

**Alerts**

- Alerts are sound only, with openly licensed chimes normalised to the same loudness, a picker for each alert and one volume slider. System notifications and vibration were left out.
- A static PWA can't alert reliably with the phone locked or the app closed. The only dependable fix is Web Push, which needs a small server, so it became optional milestone 10, after 1.0. The Notification Triggers API was abandoned by Chrome, and tricks such as looping silent audio are fragile. The user uses the app unlocked, but others may not.
- The screen is kept awake during a run by default, with a setting to turn it off.

**Stats**

- Work periods and runs are recorded, but not breaks or the number of pauses. Every period is kept, however short.
- Time against target is total time worked divided by total target, not the average of each period's percentage. Each period then counts in proportion to its target, so an accidental 4-second period barely moves it. Targets reached shows how often periods reach their target. Average overtime in minutes was dropped, because it mostly repeats the percentage.
- Work time is split at midnight, weeks start on Monday, and the current streak stays alive through today until midnight.
- A JSON backup restores by replacing all data. Merging was rejected as having more rules for little gain.

**Screens**

- Editing happens in place in the Routines list, one routine at a time, with Save and Cancel. A separate edit page and a dialog were considered first.
- Routines can be sorted by custom order, title, last used, most work time or date created. Custom order is the default.
- The theme defaults to Dark, with System and Light available.

**Name and repo**

- The app is called Cadoro, a blend of cadence and Pomodoro. No timer app with that name turned up in a search. The GitHub repo was renamed from `pomodoro` to `cadoro` before anything was deployed, because the Pages address and installed copies follow the repo's name.
- Every change goes through a pull request from the very first one, even before CI exists, rather than pushing docs straight to `main`.

**The plan**

- The work is built in vertical slices, unlike the weight tracker, which built all the logic before any UI. Each slice is cut into steps with their own pull requests, and each step into rounds of about one commit.
- The app goes online at version 0.1.0 straight after the first slice, so every later slice reaches the phone when it merges. Every pull request that changes the app bumps the version from then on, and 1.0.0 is the release that completes the spec. Deploying early means stored data must survive upgrades, so Dexie schema versions are used from the start.
- date-fns was chosen over Day.js and Temporal. It works on native dates in local time with the helpers the stats need, fits the pure-function style, and handles daylight saving. Day.js needs a plugin for ISO weeks, and Temporal still needs a polyfill for full browser support.
- LayerChart was chosen over Chart.js and hand-drawn SVG. It's Svelte-native and composed from components, as Recharts was. Chart.js draws on a canvas, which is harder to test by role.
- svelte-dnd-action was chosen over `@dnd-kit/svelte` and native drag and drop. It's long-standing and supports touch and keyboard dragging. The dnd-kit port is still at 0.5, and native drag and drop is poor on touch screens.
- Chimes use the Web Audio API directly rather than howler.js, because the need is small and scheduling on the audio clock keeps chimes on time in background tabs.
- Native elements styled with Tailwind were chosen over the bits-ui component library, because every widget the app needs exists natively. The official `@tailwindcss/forms` plugin is added so form controls are easy to style. `@tailwindcss/typography` isn't needed, because the app has no long-form text.
- Playwright tests live in a top-level `e2e/` folder rather than next to routes as the scaffold sets up, because journeys span several routes, and it keeps the production project separate.
- Claude writes the CI workflow, since the user hand-wrote one for the weight tracker.
- Node stays on 22.22.2, matching the desktop and the weight tracker. Node 22 is supported until April 2027, so it needs moving to a newer LTS before then.

**The docs**

- Decisions live in their own file, `docs/DECISIONS.md`, rather than at the end of `docs/PROGRESS.md` as in the weight tracker. Status is rewritten constantly while the log only grows, so separate files keep each one's purpose clear, and the README can link the log directly. `CLAUDE.md` loads both into every session, because decisions carrying over between sessions is what made the weight tracker's log useful. One file per decision, as architecture decision records do, was rejected as too much structure for a solo project's many small decisions.

**Planning each step**

- Claude enters plan mode as soon as the user confirms the start of a milestone or a step. At a milestone's start it plans the steps and the first step's rounds, and at each later step's start it plans that step's rounds against the code as it is by then. Work starts once the user approves. Planning the whole milestone up front was rejected, because later steps would be planned before the code they build on exists. The rule lives in the user's global Claude Code instructions, so it applies to every project built this way.
