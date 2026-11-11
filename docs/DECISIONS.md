# Decisions

Changes to the spec, plan and design, newest day first, each with its reason and often the options that were rejected.

## 2026-11-10

**The Taskfile**

- Workflows that took several commands run from `Taskfile.yml` with go-task, at the user's suggestion: setup, the checks, flakiness repeats, a production preview, the phone, ports, branches, worktrees, CI and merging. It's its own pull request before milestone 3's step 4, so the release and deploy steps there can be written as tasks from the start. Folding it into step 4 was rejected as mixing two topics, and leaving it until after milestone 3 as losing the benefit for step 4.
- The user asked for as much as is logical. Wrappers that only rename an npm script, such as `dev`, `test` or `icons`, were left out as two names for one thing. So was `pr:create`, because a pull request's title and body need writing, and a preview of the update prompt, which would need a cookie set by hand. Screenshots and proving tests by breaking them stay with Claude, as they need judgement. They may become a Claude Code skill later.
- More npm scripts were rejected because each holds one command line, with no descriptions, arguments, checks or loops. Make was rejected for its file-timestamp model and tab-sensitive syntax.
- Tasks call the npm scripts rather than repeating their commands. CI keeps calling npm directly, one step per check, so its failures stay easy to read and it never needs go-task. `check` repeats CI's order, with a comment saying the two must match.
- Every task checks what it needs with `preconditions` or `requires` before doing anything, and says what's wrong: a bad branch name, uncommitted work, a busy port, no phone, no pull request, checks not passed, or a CI image that doesn't match Playwright. Each refusal was triggered on purpose.
- `check:ci-image` compares the Playwright image's tag in `pipeline.yml` with `@playwright/test` in the lockfile, which must be bumped together, and `check` runs it first.
- `branch:delete` and `worktree:done` delete a branch only once every commit is on `main`: inside its history (`git merge-base --is-ancestor`), or, after a rebase merge gives the commits new hashes, with the same change (`git cherry`). The git rules' check, `git diff <branch> origin/main` showing nothing, stops working once `main` moves on after the merge. Recreating step 3's branch from its old tip showed `git branch -d` refusing it and the task deleting it. `worktree:done` checks before removing anything, so unmerged work is never left without its worktree.
- `branch:new` and `worktree:new` check the name against the git rules' types, and make the branch with `--no-track`, so a branch made from `origin/main` doesn't take it as its upstream. `worktree:new` copies the git-ignored local settings (`.claude`, `.zed`, `.vscode`, `CLAUDE.local.md`) and runs the worktree's own `task setup`. Until this pull request merges, `main` has no Taskfile, so a worktree from it needed `BASE=build/taskfile`.
- `ci:watch` waits up to 60 seconds for GitHub to start the checks, because `gh pr checks --watch` run straight after a push stopped with "no checks reported", which happened on this pull request.
- Local Playwright runs now write the HTML report too, never opening it by itself, so `task e2e:report` has a report to open. Before, only CI wrote one, and `playwright show-report` found nothing locally yet still exited successfully.
- `ci:report` couldn't be run all the way: CI keeps the report only when a run fails, for 14 days, and no kept run failed in the Playwright tests. Its refusal was checked on a run that failed earlier.
- The Taskfile reads `PORT` as `dev-server.ts` does, and repeats the test ports 4175 and 4176 from `playwright.config.ts` in `ports`, with a note, since YAML can't import them.

**The reload prompt**

- A new version waits for the run. The card is hidden while a run is in progress and shows once it ends, or before Play, since until milestone 4 saves runs a reload would throw the run away. Showing it at once and asking for confirmation on Reload during a run was rejected, as was showing it with Reload disabled. Either would interrupt focused work with something that can't be acted on yet.
- It's a card at the bottom, as in the weight tracker: above the phone's tab bar, in the bottom-right corner from 48rem up, in the page's opposite colours, with Reload and Later. Reload uses the other theme's Play button colours, a pair already checked for contrast. A banner under the header, pushing the screen down, was rejected.
- The browser only looks for a new version when the app opens or reloads. An hourly check while the app stays open, as the plugin's docs suggest, was offered and declined.
- `UpdatePrompt` uses `useRegisterSW` from `virtual:pwa-register/svelte`, the plugin's Svelte helper, as step 2 expected. Its `needRefresh` is a Svelte store, read with `$needRefresh`. Wrapping the plain `registerSW` in a runes class was considered, but it's more code for the same thing. `app.d.ts` now loads the Svelte module's types in place of the plain one's.
- The root layout renders the prompt with `runInProgress={timerSession.view.isInProgress}`, and the prompt registers the worker as it starts, in place of the layout's `onMount`.
- When the new version takes over, the plugin reloads every tab the app has open, not only the one where Reload was pressed, which would throw away a run in another tab. So the prompt passes `onNeedReload`, which reloads only when no run is in progress. A tab that's mid-run remembers that the new version is in control, shows the card once its run ends, and its Reload then just reloads, as no version is left waiting.
- `src/lib/page-reload.ts` holds a one-line `reloadPage()`, so component tests can replace it with `vi.mock`. Chromium doesn't let `location.reload` be replaced: assigning to it is silently ignored, and `Object.defineProperty` throws "Cannot redefine property", which was checked.

**Testing updates**

- The component tests fake `useRegisterSW` with real `writable` stores, which a test sets as the plugin would, and keep the options it was given, so a test can call `onNeedReload` itself.
- The planned Playwright journey served a changed `sw.js` through `context.route()`, but Playwright's routing never sees the browser's own update check for the worker's script, which a spike showed. Relying on the component tests and step 5's check on Pages was offered as the alternative and rejected. `@vite-pwa/sveltekit` 2.x is a new rewrite, and only a real browser would catch a change in its update behaviour.
- So `e2e/update-server.ts`, a small Node server, serves the production build at `/cadoro/` on port 4176, and adds a comment to the end of `sw.js` for a browser that sends a `version=next` cookie. Any change to the worker's bytes makes it a new version, so no second build is needed. Node 22.22 runs it straight from TypeScript. Playwright starts it as a third web server, after the production build's, and a fourth project, `updates`, runs `e2e/production/update.spec.ts` against it, which the `production` project ignores.
- The version is chosen per browser context by the cookie, rather than by a switch on the server. A global switch made the copies of `--repeat-each`, which run side by side, flip it on each other.
- A journey first reloads once after the worker installs. On a first visit the page isn't controlled by the worker, which doesn't claim open pages, so a new version activates at once rather than waiting.
- The journeys check that the card shows before Play, goes during the run, and comes back after Finish, then that Reload hands over; that Later puts it off until the next load; and that with two tabs, Reload in one leaves the other's run going until it ends. Checking that the card stayed hidden while a run found the new version was dropped, because Workbox reports a waiting worker 200 ms after it installs, and the check passed before the card could appear even with the rule broken.
- Breaking each rule on purpose failed the journey that guards it: the card ignoring the run, a tab mid-run reloading, and Reload ignoring a version already in control. A Reload that does nothing fails after 5 seconds, as `expect` would, rather than at the test's 30-second timeout. The production and update journeys passed 60 runs at ten repeats each.
- The offline test's wait for an active worker moved to `e2e/service-worker.ts`, which both use.

**The service worker**

- The service worker comes from `@vite-pwa/sveltekit`, the SvelteKit plugin from the same family as the weight tracker's `vite-plugin-pwa`, with Workbox writing the whole worker (`strategies: 'generateSW'`). Only its 2.x line supports SvelteKit 3, and 2.x is a rewrite first released on 2026-11-01, built on `@unplugin-pwa/core` 0.0.x, whose docs still describe 1.x. SvelteKit's own service worker support (`src/service-worker.ts` with `$app/manifest`), with about 40 lines of hand-written caching, was recommended for that reason and rejected in favour of Workbox's tried caching and the plugin's update prompt. The plugin was configured from its type definitions and its SvelteKit 3 example rather than its docs.
- It's pinned to exactly `2.0.2`, rather than a caret range, while the rewrite is new.
- `withPwa(kitConfig, pwaOptions)` replaces the `sveltekit()` call and runs SvelteKit's plugin itself.
- `generateSW` needs `magicast`, which the plugin lists as an optional peer dependency, but the code that writes the worker imports it directly. It's a dev dependency.
- The plugin always looks for prerendered pages, and the app prerenders none, so `globStrict: false` makes that empty pattern a warning rather than a failed build. The offline test catches a file the worker misses.
- The fallback page is kept under the folder's own address, `./`, through `spa.fallbackMapping` and `navigateFallback`, rather than as `index.html`. SvelteKit's preview server returns 404 for `/cadoro/index.html`, and one file a worker can't fetch stops it installing. Every server, GitHub Pages included, answers the folder's address with the fallback page.
- The plugin gets the absolute base path, such as `/cadoro/`. SvelteKit gives it a relative `./`, so it registered `./sw.js` with the scope `./`, which follow the page's address: opening a deeper screen first, such as milestone 8's activity log, would have looked for `/cadoro/settings/sw.js`. This also makes the manifest's `start_url` and `scope` absolute. The plugin's open issue #110 suggests the same.
- `registerSW()` from `virtual:pwa-register` registers the worker in the root layout's `onMount`, because the plugin doesn't add a script to the HTML under SvelteKit. It does nothing on the dev server, so development never runs an old cached copy. Step 3 replaces it with the Svelte version and the reload prompt.
- `registerType: 'prompt'` keeps a new version waiting until the user agrees to reload.
- The manifest link and the icon links are in `app.html` with `%sveltekit.assets%`, which follows the base path. The plugin's example adds the manifest link with `{@html}` from `virtual:pwa-info`, which needs a lint exception.
- The manifest's theme and background colours are `zinc-950`, the fixed dark theme's background, and `<meta name="theme-color">` colours the browser's bars to match.
- Checked in the build output: the worker keeps every built file, the icons, the manifest and the fallback page, and answers every page address with the fallback page. Chromium's DevTools protocol reports the production build installable, with no manifest errors.

**The app's icon**

- The icon is Lucide's `timer` (ISC licence) in white on a rounded `rose-700` square, the light theme's Play button colours. Brighter `rose-600`, the dark Play button's `rose-400` with a near-black timer, and a `zinc-950` square with a `rose-400` timer were compared in screenshots at real sizes. The dark square nearly vanished on dark tab bars and home screens.
- The timer is centred on a 32-unit square, so its farthest point is 35% of the width from the centre. That's inside the 40% radius Android never crops from a maskable icon.
- `npm run generate-icons` makes every size from `static/favicon.svg` with `@vite-pwa/assets-generator`, configured as in the weight tracker. The maskable and Apple icons fill the whole square. The generated files are committed. The scaffold's Svelte logo is gone.
- The icons' source and licence are in a new Credits section of the README, where milestone 5's chimes will go too.

**The offline test**

- `e2e/production/offline.spec.ts` opens the production build once, waits for an active service worker, goes offline, reloads, runs Play, then opens Stats from its link and Settings from its address. Turning off the navigation fallback failed the address step, while the reload of the folder's address still passed, because that address is kept as a file. Skipping registration failed the wait.
- The wait is an `expect.poll` on the worker's state with its own message, so a missing worker fails in 5 seconds and says so, rather than hanging until the test times out.

**Long routines and the timer's controls**

- With enough blocks, Play, Next and Finish are pushed below the screen. The fix is planned for milestone 6, when routines long enough to show it can first be built. Both starter routines have one or two blocks.
- The controls will be pinned at the bottom with `position: sticky`, above the phone's tab bar, so they look as they do now when everything fits. Moving them to the top was rejected, because scrolling to a later block would push them off the top instead. A bar that also shows the active time was rejected as more work, showing the time twice.
- When the run moves to a block that's out of view, the page scrolls it into view with `scrollIntoView({ block: 'nearest' })`, which does nothing when every block fits, with a `scroll-margin` clearing the pinned controls. It moves only when the block changes, not every second. The user asked about a scrollable box around the blocks. Page scrolling was recommended instead, because a scroll area inside a scrolling page is awkward on phones.

**Milestone 3's steps**

- Milestone 3 has five steps, each with its own branch and pull request: the base path and a production build test (`build/base-path`), installable and offline (`feat/offline`), the reload prompt (`feat/update-prompt`), the Pages deploy as 0.1.0 (`ci/pages-deploy`), and the version in Settings as 0.1.1 (`feat/app-version`).
- The milestone's update check uses a real change: 0.1.1 adds the version to Settings, so an installed 0.1.0 offers to reload and then shows 0.1.1. Putting everything in 0.1.0 and checking updates with milestone 4's first release was rejected, because milestone 3 would close with its own check still open. A cosmetic 0.1.1 made only to test the update was rejected as a release with nothing in it.
- Pull requests before 0.1.0 don't bump the version, because nothing is deployed yet.

**The base path**

- `vite.config.ts` reads SvelteKit's `paths.base` from `BASE_PATH`, or the site's root when it isn't set. It's written as SvelteKit wants it, `/cadoro`, with a leading slash and no trailing one, unlike Vite's `base: '/cadoro/'` in the weight tracker. SvelteKit checks the format itself when it loads the config and stops with a clear error, so the config has no check of its own. A `readBasePath` function with its own check and tests, like `readDevPort`, was planned and dropped as the same rule written twice. The variable's plain `string` is asserted to SvelteKit's `'' | `/${string}`` type, which that check makes safe.
- A third Playwright project, `production`, builds the app at `/cadoro` and serves it with `vite preview` on port 4175, so it never meets an `npm run preview` on 4173. Its server is never reused, so it can't test an old build. It runs only `e2e/production/`, which the desktop and phone projects ignore. Its tests open every screen from its link and from its own address, after a reload too, and fail on any response with an error status. Breaking `resolve()` in `ScreenNav` on purpose failed the link test.
- Its tests navigate with paths relative to `baseURL`, such as `goto('stats')`, because Playwright resolves `/stats` against the host and drops the folder.
- `vite preview` answers every address under the base path with the app, while Pages only serves files, so these tests don't cover Pages' `404.html` fallback. That's checked on Pages itself in step 4.
- The production port is fixed rather than taken from an environment variable like `PORT`, so two worktrees can't run the end-to-end tests at the same time. `strictPort` makes the second one fail loudly rather than test the wrong build, and the README says so.

**The Finish confirmation**

- The run keeps counting while Finish asks "Finish this run?". Confirming ends it at that moment, so the seconds spent deciding count as work, as the spec's "saved up to that moment" says. Cancel and Escape leave the run exactly as if Finish hadn't been pressed. Pausing while asking was rejected, because Cancel would then leave the run paused, a hidden change the user didn't ask for. Ending the run at the moment Finish was first pressed was rejected as a time the screen never showed.
- Cancel comes before Finish, so `showModal()` focuses it and a stray Enter keeps the run going.
- Whether the question is open is the Timer screen's own `$state`, not the session's, because it's about the screen rather than the run. Leaving the screen drops the question and pauses the run, as leaving always does.

**The run summary**

- The summary is headed "Run summary", names the routine under the heading, and lists the four totals as labels and values in a `<dl>`, with one Done button. A heading that says how the run ended, such as "Routine complete" or "Run finished", was rejected as a distinction the totals don't need. Leaving out the routine's name was rejected, because the summary should say what was run.
- Escape closes it like Done, readying a new run. The screen shows it for as long as the session holds an ended run, so it opens however the run ends, by Finish or a finite routine's last work period, and is still there after a visit to another screen.
- `TimerSession.finish()` keeps the ended run, and a new `readyNewRun()` replaces it once the summary closes. `readyNewRun()` does nothing during a run, so a stray call can't throw away work in progress.

**Dialogs**

- Both dialogs are native `<dialog>` elements opened with `showModal()`, built on one small `ModalDialog` component. It takes the content as `children`, the buttons as an `actions` snippet laid out in a row, and reports Escape through `onclose`. It has no flags or modes.
- A dialog opens as soon as it mounts, through an `{@attach}` attachment, since `showModal()` needs the element in the document. The screen shows each dialog inside an `{#if}` and closes it by removing it. An `open` prop kept in step with the element by an `$effect` was rejected as two copies of the same state that could drift apart.
- Tailwind's base styles set every margin to 0, which removes the browser's `margin: auto` that centres a modal dialog, so the dialog has `m-auto`. It leaves a 1rem gutter on each side of a phone and is at most 24rem (`max-w-sm`) wide.
- In dark, the dialog is `zinc-800` with a `zinc-700` border, a step lighter than the `zinc-900` cards behind it. Screenshots showed a `zinc-900` dialog's edge blending into the cards. A darker backdrop was considered instead, but a lighter surface is how dark themes usually show something raised. Its text stays above 5:1.
- The colours of the main button and the outlined ones moved to `button-colours.ts`, so the timer's controls and the dialogs share them. Tailwind still builds class names kept in a `.ts` file, because it scans every source file, which was checked in the built CSS.

**Playwright on a controlled clock**

- The journeys that run the timer open the app on Playwright's fake clock with `openOnPausedClock` in `e2e/clock.ts`. The clock is installed before the page loads and paused once it has loaded, as Playwright's docs advise, so nothing waits forever on a stopped timer while loading. Tests then move it with `fastForward`, which fires each due timer at most once. One tick is enough, since every time comes from timestamps. `runFor`, which fires every tick on the way, wasn't needed.
- On a paused clock, SvelteKit never follows a link. Before navigating, it waits for the browser to repaint, with `requestAnimationFrame` then `setTimeout`, or a 100 ms `setTimeout` at most, and the fake clock fakes both. `followLink` clicks a link and runs the clock for those 100 ms. A run counting meanwhile gains 100 ms, which whole seconds don't show.
- A new journey runs Classic with long break through overtime, a break, the next cycle, a cancelled and a confirmed Finish, and the summary's exact totals. The pause-on-leave journey now checks exact times, and its summary shows the 10 minutes away weren't counted. Both passed 40 runs in a row, across the desktop and phone projects.
- A finite routine ending on its own is checked in component tests with a one-round routine, since both starter routines repeat forever.

**The dev server's port**

- The dev server and Playwright take their port from `PORT`, defaulting to Vite's 5173, through one shared `dev-server.ts`. Vite's `strictPort` makes the server fail on a busy port rather than move to the next free one. Before this, Playwright silently reused a dev server already on 5173 from another git worktree, and a second server quietly moved to 5174. Checking it showed exactly that: a stand-in server moved to 5174 and Playwright tested it. A second worktree now runs its commands with its own port, such as `PORT=5174 npm run test:e2e`. Turning off `reuseExistingServer` was rejected, because it would also refuse the worktree's own dev server while you're using it.
- An invalid `PORT` stops the config with a clear error, rather than starting Vite on a port it can't use.
- The configs import `./dev-server.ts` with its extension, because Vite 8.3 warns that a future major version will load its config as a native Node module, which needs it.
- This was its own pull request from `main`, made in a worktree while the timer screen step was in progress, following the worktree rules in the global git instructions.

**The timer screen**

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

**The cycle counter**

- A block of two or more cycles shows its cycle across from its title, such as "Cycle 2 / 3", as a box's target sits across from its label. The user asked for it during the controls round, as the cycle belongs to the block. Putting it in the summary line under the title was rejected as easy to miss, and it would mix a live count with the block's settings.
- The counter always matches the position label. It first showed "Cycle 0 / 3" before Play, zeroed like the idle boxes, but that disagreed with the label's "Cycle 1 of 3", which says where the run will start. So the ready view now carries the block and cycle the run will start at, and the first block counts from there. Blocks the run isn't in still show cycle 0, and the label never mentions them, so nothing disagrees.
- A block of one cycle shows no counter, as the label leaves out any part whose total is 1. Showing "Cycle 1 / 1" for the same shape on every card was rejected as a counter that never moves.
- The position label keeps its cycle part, so it stays a one-line summary of the whole position. Dropping it to avoid showing the cycle twice was rejected.

**The live timer**

- The screen ticks with a `setInterval` in an `$effect` that runs only while a timer is counting. The effect reads a `$derived` `isRunning` rather than the view, because the view changes every tick and would restart the interval each second, while a derived value only notifies when its value changes. The interval only redraws: every time still comes from timestamps, so a late tick can't make the time wrong.
- Leaving the screen pauses the run through `onDestroy`, because SvelteKit removes the Timer page when another screen opens, while the session outlives it.

**Svelte state and classes**

- `TimerSession` keeps its state in JavaScript's `#` private fields rather than TypeScript's `private`. This breaks from Google's TypeScript style guide, which says not to use `#private` fields, because its reason, the code they compile to for older browsers, doesn't apply to Vite's modern target. `#` is also enforced at runtime, where `private` only exists in the type checker.
- The run is held in `$state.raw`, not `$state`, because the engine's runs are immutable values replaced whole. Deep `$state` would wrap each run in a proxy for changes that never happen.
- The starter routines' ids come from `() => crypto.randomUUID()`, not `crypto.randomUUID` passed as it is, because the method called away from `crypto` loses its `this` and throws "Illegal invocation" in browsers, which was confirmed in Chromium.

**Testing the timer**

- The screen's component tests fake only `setInterval` and `clearInterval` with `vi.useFakeTimers({ toFake: [...] })`, which works in Vitest's browser mode. A test fires the screen's tick itself, the session reads the test's own clock, and `vi.getTimerCount()` proves the interval was cleared. Faking `Date` too wasn't needed, because the session already takes its clock as a parameter, and faking only the interval leaves the test runner's own waiting on real timers.
- One Playwright journey checks the real app: Play counts up, opening Stats and coming back finds the run paused and kept, and Finish readies a new run. It waits for one real second rather than faking the clock, which comes with step 4's journeys. It checks that the run wasn't reset rather than its exact time, which depends on real timing, and passed ten runs in a row.

**Durations in tests**

- Tests write lengths of time as `minutes(25)` and `seconds(40)`, from `src/lib/testing/durations.ts`, rather than `25 * 60_000`. The style guide's exception lets tests keep literal values so their data is visible, but `60_000` is a conversion, not data, and was repeated 86 times. The global style guide now says so. The helpers are separate from `time.ts`, so a test's expected values don't come from the code it checks. Importing `minutesToMs` was rejected for that reason.
- Values already in milliseconds, such as `1_499` in the work-time tests, stay literal. So do `time.test.ts`'s, where the milliseconds are the data being formatted.

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

- The position label leaves out any part whose total is 1, because it never changes during a run. Classic shows just "Round 5" rather than "Round 5 · Block 1 of 1 · Cycle 1 of 1", which matches the spec's own "Round 5" example. The round and block parts stay for the whole run, since their totals don't change mid-run. The cycle part follows the current block's cycles, so it's left out on a block of one cycle, such as the Long break in Classic with long break, which shows "Round 1 · Block 2 of 2". This sentence first said every part stayed for the whole run, which the timer screen's tests showed wasn't so. Showing all three parts on every routine was rejected as noise, and always showing the round was rejected because a one-round routine's "Round 1 of 1" never changes either. A routine of one round, one block and one cycle has an empty label.
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
