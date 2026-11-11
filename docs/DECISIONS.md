# Decisions

Changes to the spec, plan and design, newest day first, each with its reason and often the options that were rejected.

## 2026-11-10

**The dev server's port**

- The dev server and Playwright take their port from `PORT`, defaulting to Vite's 5173, through one shared `dev-server.ts`. Vite's `strictPort` makes the server fail on a busy port rather than move to the next free one. Before this, Playwright silently reused a dev server already on 5173 from another git worktree, and a second server quietly moved to 5174. Checking it showed exactly that: a stand-in server moved to 5174 and Playwright tested it. A second worktree now runs its commands with its own port, such as `PORT=5174 npm run test:e2e`. Turning off `reuseExistingServer` was rejected, because it would also refuse the worktree's own dev server while you're using it.
- An invalid `PORT` stops the config with a clear error, rather than starting Vite on a port it can't use.
- The configs import `./dev-server.ts` with its extension, because Vite 8.3 warns that a future major version will load its config as a native Node module, which needs it.
- This was its own pull request from `main`, made in a worktree while the timer screen step was in progress, following the worktree rules in the global git instructions.

**Doc comments in Svelte components**

- Svelte components are now checked with the same TSDoc and JSDoc rules as TypeScript files, settling the question left open below. Each component starts with a `<!-- @component -->` comment, Svelte's own convention, which editors show when hovering over the component where it's used. Each prop has a comment on its field in the component's `Props` type. Functions, types and constants in either script need one, as in `.ts` files.
- Variables declared with `$state`, `$derived` or `$props` need no comment. They're named for what they hold, and the component's comment and `Props` type already describe them. Requiring one on every declaration, as in `.ts` files, was rejected as repeating what good names say. Leaving `.svelte` files unchecked was rejected because a missing comment would only show up in review.
- The `@component` comment is required with ESLint's `no-restricted-syntax` and a selector, since no plugin rule checks it. The rune exception uses attribute paths such as `[init.callee.name=…]`, because esquery 1.7, ESLint's selector engine, fails to match field selectors such as `CallExpression.init` inside `:has(> …)`.

**The theme**

- Tailwind's `dark:` variant follows a `data-theme` attribute on `<html>` instead of the system's colour scheme, so the theme setting in milestone 5 only has to change the attribute. It's fixed to `dark`, the spec's default, until then. Every element carries both its light and its dark colours from the start, and both are checked in screenshots. Naming the app's colours in `@theme`, such as `bg-surface`, was rejected as less of Tailwind's own `dark:` pattern to learn. Writing only dark colours now was rejected because milestone 5 would then revisit every class.
- The page's colours are on `<body>`, so the whole window follows the theme, including the area shown when scrolling past the end on a phone. `color-scheme` follows the theme too, so the browser draws its own controls and scrollbars to match.

**The app shell**

- Navigation has icons and labels on both layouts: a tab bar fixed to the bottom on phones, and links on the right of the header from Tailwind's `md` breakpoint, 48rem, as in the weight tracker. Icons only on phones, or labels only, were rejected as harder to tell apart at a glance or less consistent between the two. The icons are Lucide's `timer`, `list`, `chart-column` and `settings`, from `@lucide/svelte` (ISC licence), imported one file per icon so the dev server doesn't load the whole set.
- The current screen's link is marked with `aria-current="page"` and highlighted in rose, the app's first accent colour. Light uses rose-700, because rose-600 on white is only 4.51:1, just over the 4.5:1 minimum, and dark uses rose-400.
- The header shows the app's name as plain text, and each screen has its own `<h1>` and tab title, such as "Routines · Cadoro", as in the weight tracker. Screens sit in a centred column up to `max-w-3xl` (48rem) wide.
- The layout passes the current route's id to the navigation, rather than the URL's path, because the id stays `/routines` when milestone 3 serves the app from `/cadoro/`. Passing it as a prop also lets component tests render the navigation without faking SvelteKit's `page`. A screen also counts as current on any route under it, so the activity log page inside Settings will still highlight Settings.
- Links are built with SvelteKit's `resolve()`, which adds the base path, as ESLint's recommended `svelte/no-navigation-without-resolve` rule requires.
- Placeholder screens say what they'll hold "in a later version", rather than naming a milestone, which means nothing to someone using the app. They share one `ScreenPlaceholder` component.

**SvelteKit's generated types**

- `package.json` has a `dependencies` script that runs `svelte-kit sync`. SvelteKit 3 writes its generated types to `node_modules/$app`, which `npm install <package>` and `npm uninstall <package>` delete as an unknown package, while `prepare` only runs on a bare `npm install`. npm runs the `dependencies` script after any command that changes `node_modules`, which a `--no-save` install and uninstall confirmed.
- Zed also needs `file_scan_inclusions` to include `node_modules/$app/**`, or its language servers keep out-of-date route types. That lives in the git-ignored `.zed/settings.json`, since editor setup is personal.

**Doc comments**

- TypeScript files are checked for TSDoc comments with `eslint-plugin-tsdoc` and `eslint-plugin-jsdoc`, configured as in the weight tracker: a comment on every module-level declaration, type and field, and `@param` and `@returns` on every function. It came in its own pull request before the run engine, so the engine is checked from its first line, rather than as the first commit of that step.
- JavaScript files, such as `prettier.config.js`, aren't checked, because they give values types with JSDoc tags such as `@type`, which TSDoc doesn't have.
- Svelte components aren't checked yet. Requiring a comment on every module-level variable would mean commenting every `$state` in a component's script, so how the rules fit `.svelte` files is decided once the first real component exists.

**Routines and the position label**

- The position label leaves out any part whose total is 1, because it never changes during a run. Classic shows just "Round 5" rather than "Round 5 · Block 1 of 1 · Cycle 1 of 1", which matches the spec's own "Round 5" example. A routine's label keeps the same parts for the whole run, since its totals don't change mid-run. Showing all three parts on every routine was rejected as noise, and always showing the round was rejected because a one-round routine's "Round 1 of 1" never changes either. A routine of one round, one block and one cycle has an empty label.
- A routine with one block has 1 cycle, because with one block cycles and rounds do the same job: 3 cycles of 2 rounds is the same run as 6 rounds, and an infinite routine's cycles mean nothing. The editor shows the field disabled at 1 with a hint, rather than hiding it, so the form keeps its layout and says why. Deleting blocks down to one resets the remaining block's cycles to 1, and rounds stay as they were. Folding the cycles into rounds, to keep the run the same length, was rejected because it changes a field the user didn't touch. The run engine still handles any number of cycles, and validation enforces the rule in the editor and on import.

**The run engine**

- Milestone 2 has four steps, each with its own branch and pull request: the run engine (`feat/run-engine`), the app shell (`feat/app-shell`), the timer screen (`feat/timer-screen`), and the Finish confirmation and run summary (`feat/run-summary`).
- The engine works in milliseconds since 1970 (`number`), and every function takes `now` as an argument, so nothing in `src/lib` reads the clock and tests control time exactly. Converting to UTC strings for storage comes with storage in milestone 4.
- The starter routines come from `createStarterRoutines(now, newId)` rather than plain constants, because each routine and block needs a UUID and a creation time. The clock and id generator are passed in, so the result is predictable, and milestone 4 reuses it on first launch. The spec doesn't name the starter blocks, so they're called Focus, and Focus and Long break.
- A run is a discriminated union of four states, ready, working, break and ended, each holding only its own fields, and every button is a pure function from one state to the next. A button that does nothing in the current state, such as Pause before Play, returns the run unchanged rather than throwing, since the screen disables it anyway.
- A break at 0:00, waiting for Play, isn't a state of its own. It's worked out from the time left, because a separate state would need a timer to switch into it, which is the tick-counting the spec rules out. It shows as not running, so the button reads Play.
- The last work period of a finite routine ends the run inside Next, as the plan's round 5 rather than round 6, because Next has to do something at that point.
- Times show rounded down while counting up, so `0:01` appears once a full second has passed, and rounded up while counting down, so a break reaches `0:00` exactly when it ends rather than a second early. Negative times show as `0:00`.
- The run summary's "work periods completed" counts every saved work period, including one that Finish cut short, because stats will count it too.
- A break's percentage is taken with the multiplication first, `(worked * percent) / 100`, rather than `worked * (percent / 100)`. Most decimal fractions can't be stored exactly in binary, and dividing the percentage first rounded 26 of 40 million exact half-second breaks the wrong way, such as 50 seconds at 29% giving 14 seconds instead of 15.

**Code style**

- Code follows the user's global style guide, `~/.claude/rules/style-guide.md`: self-documenting code with named intermediate results, named constants instead of magic numbers, descriptive names without abbreviations, comments that explain why, whole-number arithmetic that divides last, and modules named for what they provide. Each rule cites its source.
- Shared logic is extracted at once into a small core with one meaning and no flags, and each slightly different need gets its own function that calls the core, as `earnedBreakMs` calls `percentOf`. The Rule of Three, which waits for a third copy, was rejected because the user doesn't want duplicated code. Merging only code that means the same thing guards against the wrong abstraction the Rule of Three exists to avoid.
- The guide was applied to the code already written by a subagent in a git worktree, reviewed in two passes until nothing was left to fix. This project's worktrees live in `../pomodoro-worktrees/`.

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
