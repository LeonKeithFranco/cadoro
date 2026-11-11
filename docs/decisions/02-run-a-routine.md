# Decisions: milestone 2, Run a routine

Both starter routines run through work, overtime, breaks and Finish on the dev server, with nothing saved yet. Done on 2026-11-10 in pull requests #7 to #12.

## Before step 1: doc comments (`build/lint-doc-comments`), 2026-11-10

### Doc comments

- TypeScript files are checked for TSDoc comments with `eslint-plugin-tsdoc` and `eslint-plugin-jsdoc`, configured as in the weight tracker: a comment on every module-level declaration, type and field, and `@param` and `@returns` on every function. It came in its own pull request before the run engine, so the engine is checked from its first line, rather than as the first commit of that step.
- JavaScript files, such as `prettier.config.js`, aren't checked, because they give values types with JSDoc tags such as `@type`, which TSDoc doesn't have.
- Svelte components aren't checked yet. Requiring a comment on every module-level variable would mean commenting every `$state` in a component's script, so how the rules fit `.svelte` files is decided once the first real component exists.
- **Changed later:** Svelte components are checked from step 2, in [Doc comments in Svelte components](#doc-comments-in-svelte-components).

## Step 1: the run engine (`feat/run-engine`), 2026-11-10

### The run engine

- Milestone 2 has four steps, each with its own branch and pull request: the run engine (`feat/run-engine`), the app shell (`feat/app-shell`), the timer screen (`feat/timer-screen`), and the Finish confirmation and run summary (`feat/run-summary`).
- The engine works in milliseconds since 1970 (`number`), and every function takes `now` as an argument, so nothing in `src/lib` reads the clock and tests control time exactly. Converting to UTC strings for storage comes with storage in milestone 4.
- The starter routines come from `createStarterRoutines(now, newId)` rather than plain constants, because each routine and block needs a UUID and a creation time. The clock and id generator are passed in, so the result is predictable, and milestone 4 reuses it on first launch. The spec doesn't name the starter blocks, so they're called Focus, and Focus and Long break.
- A run is a discriminated union of four states, ready, working, break and ended, each holding only its own fields, and every button is a pure function from one state to the next. A button that does nothing in the current state, such as Pause before Play, returns the run unchanged rather than throwing, since the screen disables it anyway.
- A break at 0:00, waiting for Play, isn't a state of its own. It's worked out from the time left, because a separate state would need a timer to switch into it, which is the tick-counting the spec rules out. It shows as not running, so the button reads Play.
- The last work period of a finite routine ends the run inside Next, as the plan's round 5 rather than round 6, because Next has to do something at that point.
- Times show rounded down while counting up, so `0:01` appears once a full second has passed, and rounded up while counting down, so a break reaches `0:00` exactly when it ends rather than a second early. Negative times show as `0:00`.
- The run summary's "work periods completed" counts every saved work period, including one that Finish cut short, because stats will count it too.
- A break's percentage is taken with the multiplication first, `(worked * percent) / 100`, rather than `worked * (percent / 100)`. Most decimal fractions can't be stored exactly in binary, and dividing the percentage first rounded 26 of 40 million exact half-second breaks the wrong way, such as 50 seconds at 29% giving 14 seconds instead of 15.

### Routines and the position label

- The position label leaves out any part whose total is 1, because it never changes during a run. Classic shows just "Round 5" rather than "Round 5 · Block 1 of 1 · Cycle 1 of 1", which matches the spec's own "Round 5" example. The round and block parts stay for the whole run, since their totals don't change mid-run. The cycle part follows the current block's cycles, so it's left out on a block of one cycle, such as the Long break in Classic with long break, which shows "Round 1 · Block 2 of 2". This sentence first said every part stayed for the whole run, which the timer screen's tests showed wasn't so. Showing all three parts on every routine was rejected as noise, and always showing the round was rejected because a one-round routine's "Round 1 of 1" never changes either. A routine of one round, one block and one cycle has an empty label.
- A routine with one block has 1 cycle, because with one block cycles and rounds do the same job: 3 cycles of 2 rounds is the same run as 6 rounds, and an infinite routine's cycles mean nothing. The editor shows the field disabled at 1 with a hint, rather than hiding it, so the form keeps its layout and says why. Deleting blocks down to one resets the remaining block's cycles to 1, and rounds stay as they were. Folding the cycles into rounds, to keep the run the same length, was rejected because it changes a field the user didn't touch. The run engine still handles any number of cycles, and validation enforces the rule in the editor and on import.

### Code style

- Code follows the user's global style guide, `~/.claude/rules/style-guide.md`: self-documenting code with named intermediate results, named constants instead of magic numbers, descriptive names without abbreviations, comments that explain why, whole-number arithmetic that divides last, and modules named for what they provide. Each rule cites its source.
- Shared logic is extracted at once into a small core with one meaning and no flags, and each slightly different need gets its own function that calls the core, as `earnedBreakMs` calls `percentOf`. The Rule of Three, which waits for a third copy, was rejected because the user doesn't want duplicated code. Merging only code that means the same thing guards against the wrong abstraction the Rule of Three exists to avoid.
- The guide was applied to the code already written by a subagent in a git worktree, reviewed in two passes until nothing was left to fix. This project's worktrees live in `../pomodoro-worktrees/`.

## Step 2: the app shell (`feat/app-shell`), 2026-11-10

### The app shell

- Navigation has icons and labels on both layouts: a tab bar fixed to the bottom on phones, and links on the right of the header from Tailwind's `md` breakpoint, 48rem, as in the weight tracker. Icons only on phones, or labels only, were rejected as harder to tell apart at a glance or less consistent between the two. The icons are Lucide's `timer`, `list`, `chart-column` and `settings`, from `@lucide/svelte` (ISC licence), imported one file per icon so the dev server doesn't load the whole set.
- The current screen's link is marked with `aria-current="page"` and highlighted in rose, the app's first accent colour. Light uses rose-700, because rose-600 on white is only 4.51:1, just over the 4.5:1 minimum, and dark uses rose-400.
- The header shows the app's name as plain text, and each screen has its own `<h1>` and tab title, such as "Routines · Cadoro", as in the weight tracker. Screens sit in a centred column up to `max-w-3xl` (48rem) wide.
- The layout passes the current route's id to the navigation, rather than the URL's path, because the id stays `/routines` when milestone 3 serves the app from `/cadoro/`. Passing it as a prop also lets component tests render the navigation without faking SvelteKit's `page`. A screen also counts as current on any route under it, so the activity log page inside Settings will still highlight Settings.
- Links are built with SvelteKit's `resolve()`, which adds the base path, as ESLint's recommended `svelte/no-navigation-without-resolve` rule requires.
- Placeholder screens say what they'll hold "in a later version", rather than naming a milestone, which means nothing to someone using the app. They share one `ScreenPlaceholder` component.

### The theme

- Tailwind's `dark:` variant follows a `data-theme` attribute on `<html>` instead of the system's colour scheme, so the theme setting in milestone 5 only has to change the attribute. It's fixed to `dark`, the spec's default, until then. Every element carries both its light and its dark colours from the start, and both are checked in screenshots. Naming the app's colours in `@theme`, such as `bg-surface`, was rejected as less of Tailwind's own `dark:` pattern to learn. Writing only dark colours now was rejected because milestone 5 would then revisit every class.
- The page's colours are on `<body>`, so the whole window follows the theme, including the area shown when scrolling past the end on a phone. `color-scheme` follows the theme too, so the browser draws its own controls and scrollbars to match.

### SvelteKit's generated types

- `package.json` has a `dependencies` script that runs `svelte-kit sync`. SvelteKit 3 writes its generated types to `node_modules/$app`, which `npm install <package>` and `npm uninstall <package>` delete as an unknown package, while `prepare` only runs on a bare `npm install`. npm runs the `dependencies` script after any command that changes `node_modules`, which a `--no-save` install and uninstall confirmed.
- Zed also needs `file_scan_inclusions` to include `node_modules/$app/**`, or its language servers keep out-of-date route types. That lives in the git-ignored `.zed/settings.json`, since editor setup is personal.

### Doc comments in Svelte components

- Svelte components are now checked with the same TSDoc and JSDoc rules as TypeScript files, settling the question left open in [Doc comments](#doc-comments). Each component starts with a `<!-- @component -->` comment, Svelte's own convention, which editors show when hovering over the component where it's used. Each prop has a comment on its field in the component's `Props` type. Functions, types and constants in either script need one, as in `.ts` files.
- Variables declared with `$state`, `$derived` or `$props` need no comment. They're named for what they hold, and the component's comment and `Props` type already describe them. Requiring one on every declaration, as in `.ts` files, was rejected as repeating what good names say. Leaving `.svelte` files unchecked was rejected because a missing comment would only show up in review.
- The `@component` comment is required with ESLint's `no-restricted-syntax` and a selector, since no plugin rule checks it. The rune exception uses attribute paths such as `[init.callee.name=…]`, because esquery 1.7, ESLint's selector engine, fails to match field selectors such as `CallExpression.init` inside `:has(> …)`.

## Step 3: the timer screen (`feat/timer-screen`), 2026-11-10

### The timer screen

- A block's boxes that aren't in use show zeroed timers, such as `0:00 / 25:00` and `0:00`, so every box keeps its shape. During a break, its block's work box stays at the time just worked, which shows what earned the break. Dashes in idle boxes were rejected.
- What each block card shows is worked out by a pure function, `viewBlock`, from the run's view, as `viewRun` does for the screen, so the rules are unit tested and the card only lays them out.
- The run will live in a shared `TimerSession` class in `src/lib/timer.svelte.ts`, rather than in the Timer page, which SvelteKit removes when another screen opens. Leaving the Timer screen pauses the run, work or break, and Play resumes it. This is new to the spec: switching screens inside the app counts as stepping away, unlike a background tab, where the timer keeps running. A reload still loses the run until milestone 4 saves it.
- Until step 4 adds its confirmation and the run summary, Finish ends the run at once and the screen returns to ready. Disabling Finish until then was rejected, because a reload would be the only way to stop a run.
- The active box has a rose outline. Past the target, the work box's outline and time turn amber and its label reads "Work · Overtime", so the change isn't shown by colour alone. Filling the box with solid rose was rejected as the same colour as normal.
- The blocks stack in one column on every screen size, in run order, so the screen reads top to bottom as the run goes. Cards side by side on wide screens were tried and felt wrong, because the order the run takes stopped being plain.
- Each box has its label on the left, its time on the right, lined up on their baseline, and a progress bar below. This is new to the spec. The work bar fills towards the target and stays full, in amber, in overtime. The break bar shows the break left out of the break earned. Idle boxes have empty bars, and a work box kept during its break keeps its bar as it was. The bars are hidden from screen readers, which read the times.
- Each box is a `role="group"` named by its label, so a screen reader says "Work" or "Break earned" before the time, and tests find boxes by role and name. Each card is a `<section>` named by its title, which makes it a region.
- The routine picker is disabled during a run, rather than hidden, so the screen keeps its layout and still shows which routine is running.
- `ScreenHeading` gives every screen its `<h1>` and tab title from one prop, so the two can't drift apart.
- The colours were checked against WCAG in both themes: every text pair is at least 5:1, against the 4.5:1 minimum, and every outline and bar at least 3.8:1, against 3:1.
- Play, Next and Finish sit in a row of three equal buttons below the blocks, with Play filled in rose and the other two outlined. Play reads Pause, with its icon, while a timer is counting. Screenshots showed them clear of the phone's tab bar, so fixing them above it wasn't needed for now.
- **Changed later:** Finish asks first from step 4, in [The Finish confirmation](#the-finish-confirmation).

### The cycle counter

- A block of two or more cycles shows its cycle across from its title, such as "Cycle 2 / 3", as a box's target sits across from its label. The user asked for it during the controls round, as the cycle belongs to the block. Putting it in the summary line under the title was rejected as easy to miss, and it would mix a live count with the block's settings.
- The counter always matches the position label. It first showed "Cycle 0 / 3" before Play, zeroed like the idle boxes, but that disagreed with the label's "Cycle 1 of 3", which says where the run will start. So the ready view now carries the block and cycle the run will start at, and the first block counts from there. Blocks the run isn't in still show cycle 0, and the label never mentions them, so nothing disagrees.
- A block of one cycle shows no counter, as the label leaves out any part whose total is 1. Showing "Cycle 1 / 1" for the same shape on every card was rejected as a counter that never moves.
- The position label keeps its cycle part, so it stays a one-line summary of the whole position. Dropping it to avoid showing the cycle twice was rejected.

### The live timer

- The screen ticks with a `setInterval` in an `$effect` that runs only while a timer is counting. The effect reads a `$derived` `isRunning` rather than the view, because the view changes every tick and would restart the interval each second, while a derived value only notifies when its value changes. The interval only redraws: every time still comes from timestamps, so a late tick can't make the time wrong.
- Leaving the screen pauses the run through `onDestroy`, because SvelteKit removes the Timer page when another screen opens, while the session outlives it.

### Svelte state and classes

- `TimerSession` keeps its state in JavaScript's `#` private fields rather than TypeScript's `private`. This breaks from Google's TypeScript style guide, which says not to use `#private` fields, because its reason, the code they compile to for older browsers, doesn't apply to Vite's modern target. `#` is also enforced at runtime, where `private` only exists in the type checker.
- The run is held in `$state.raw`, not `$state`, because the engine's runs are immutable values replaced whole. Deep `$state` would wrap each run in a proxy for changes that never happen.
- The starter routines' ids come from `() => crypto.randomUUID()`, not `crypto.randomUUID` passed as it is, because the method called away from `crypto` loses its `this` and throws "Illegal invocation" in browsers, which was confirmed in Chromium.

### Testing the timer

- The screen's component tests fake only `setInterval` and `clearInterval` with `vi.useFakeTimers({ toFake: [...] })`, which works in Vitest's browser mode. A test fires the screen's tick itself, the session reads the test's own clock, and `vi.getTimerCount()` proves the interval was cleared. Faking `Date` too wasn't needed, because the session already takes its clock as a parameter, and faking only the interval leaves the test runner's own waiting on real timers.
- One Playwright journey checks the real app: Play counts up, opening Stats and coming back finds the run paused and kept, and Finish readies a new run. It waits for one real second rather than faking the clock, which comes with step 4's journeys. It checks that the run wasn't reset rather than its exact time, which depends on real timing, and passed ten runs in a row.

### Durations in tests

- Tests write lengths of time as `minutes(25)` and `seconds(40)`, from `src/lib/testing/durations.ts`, rather than `25 * 60_000`. The style guide's exception lets tests keep literal values so their data is visible, but `60_000` is a conversion, not data, and was repeated 86 times. The global style guide now says so. The helpers are separate from `time.ts`, so a test's expected values don't come from the code it checks. Importing `minutesToMs` was rejected for that reason.
- Values already in milliseconds, such as `1_499` in the work-time tests, stay literal. So do `time.test.ts`'s, where the milliseconds are the data being formatted.

### The dev server's port

- The dev server and Playwright take their port from `PORT`, defaulting to Vite's 5173, through one shared `dev-server.ts`. Vite's `strictPort` makes the server fail on a busy port rather than move to the next free one. Before this, Playwright silently reused a dev server already on 5173 from another git worktree, and a second server quietly moved to 5174. Checking it showed exactly that: a stand-in server moved to 5174 and Playwright tested it. A second worktree now runs its commands with its own port, such as `PORT=5174 npm run test:e2e`. Turning off `reuseExistingServer` was rejected, because it would also refuse the worktree's own dev server while you're using it.
- An invalid `PORT` stops the config with a clear error, rather than starting Vite on a port it can't use.
- The configs import `./dev-server.ts` with its extension, because Vite 8.3 warns that a future major version will load its config as a native Node module, which needs it.
- This was its own pull request from `main`, made in a worktree while the timer screen step was in progress, following the worktree rules in the global git instructions.

## Step 4: the Finish confirmation and run summary (`feat/run-summary`), 2026-11-10

### The Finish confirmation

- The run keeps counting while Finish asks "Finish this run?". Confirming ends it at that moment, so the seconds spent deciding count as work, as the spec's "saved up to that moment" says. Cancel and Escape leave the run exactly as if Finish hadn't been pressed. Pausing while asking was rejected, because Cancel would then leave the run paused, a hidden change the user didn't ask for. Ending the run at the moment Finish was first pressed was rejected as a time the screen never showed.
- Cancel comes before Finish, so `showModal()` focuses it and a stray Enter keeps the run going.
- Whether the question is open is the Timer screen's own `$state`, not the session's, because it's about the screen rather than the run. Leaving the screen drops the question and pauses the run, as leaving always does.

### The run summary

- The summary is headed "Run summary", names the routine under the heading, and lists the four totals as labels and values in a `<dl>`, with one Done button. A heading that says how the run ended, such as "Routine complete" or "Run finished", was rejected as a distinction the totals don't need. Leaving out the routine's name was rejected, because the summary should say what was run.
- Escape closes it like Done, readying a new run. The screen shows it for as long as the session holds an ended run, so it opens however the run ends, by Finish or a finite routine's last work period, and is still there after a visit to another screen.
- `TimerSession.finish()` keeps the ended run, and a new `readyNewRun()` replaces it once the summary closes. `readyNewRun()` does nothing during a run, so a stray call can't throw away work in progress.

### Dialogs

- Both dialogs are native `<dialog>` elements opened with `showModal()`, built on one small `ModalDialog` component. It takes the content as `children`, the buttons as an `actions` snippet laid out in a row, and reports Escape through `onclose`. It has no flags or modes.
- A dialog opens as soon as it mounts, through an `{@attach}` attachment, since `showModal()` needs the element in the document. The screen shows each dialog inside an `{#if}` and closes it by removing it. An `open` prop kept in step with the element by an `$effect` was rejected as two copies of the same state that could drift apart.
- Tailwind's base styles set every margin to 0, which removes the browser's `margin: auto` that centres a modal dialog, so the dialog has `m-auto`. It leaves a 1rem gutter on each side of a phone and is at most 24rem (`max-w-sm`) wide.
- In dark, the dialog is `zinc-800` with a `zinc-700` border, a step lighter than the `zinc-900` cards behind it. Screenshots showed a `zinc-900` dialog's edge blending into the cards. A darker backdrop was considered instead, but a lighter surface is how dark themes usually show something raised. Its text stays above 5:1.
- The colours of the main button and the outlined ones moved to `button-colours.ts`, so the timer's controls and the dialogs share them. Tailwind still builds class names kept in a `.ts` file, because it scans every source file, which was checked in the built CSS.

### Playwright on a controlled clock

- The journeys that run the timer open the app on Playwright's fake clock with `openOnPausedClock` in `e2e/clock.ts`. The clock is installed before the page loads and paused once it has loaded, as Playwright's docs advise, so nothing waits forever on a stopped timer while loading. Tests then move it with `fastForward`, which fires each due timer at most once. One tick is enough, since every time comes from timestamps. `runFor`, which fires every tick on the way, wasn't needed.
- On a paused clock, SvelteKit never follows a link. Before navigating, it waits for the browser to repaint, with `requestAnimationFrame` then `setTimeout`, or a 100 ms `setTimeout` at most, and the fake clock fakes both. `followLink` clicks a link and runs the clock for those 100 ms. A run counting meanwhile gains 100 ms, which whole seconds don't show.
- A new journey runs Classic with long break through overtime, a break, the next cycle, a cancelled and a confirmed Finish, and the summary's exact totals. The pause-on-leave journey now checks exact times, and its summary shows the 10 minutes away weren't counted. Both passed 40 runs in a row, across the desktop and phone projects.
- A finite routine ending on its own is checked in component tests with a one-round routine, since both starter routines repeat forever.
