# Decisions: milestone 3, PWA and GitHub Pages

The app goes online at GitHub Pages, installable and working offline, and offers to reload when a new version is ready. Done from 2026-11-10 to 2026-11-11 in pull requests #13 to #19, and released as 0.1.0 and 0.2.0.

## Planning, 2026-11-10

### Milestone 3's steps

- Milestone 3 has five steps, each with its own branch and pull request: the base path and a production build test (`build/base-path`), installable and offline (`feat/offline`), the reload prompt (`feat/update-prompt`), the Pages deploy as 0.1.0 (`ci/pages-deploy`), and the version in Settings as 0.1.1 (`feat/app-version`).
- The milestone's update check uses a real change: 0.1.1 adds the version to Settings, so an installed 0.1.0 offers to reload and then shows 0.1.1. Putting everything in 0.1.0 and checking updates with milestone 4's first release was rejected, because milestone 3 would close with its own check still open. A cosmetic 0.1.1 made only to test the update was rejected as a release with nothing in it.
- Pull requests before 0.1.0 don't bump the version, because nothing is deployed yet.
- **Changed later:** step 5 was released as 0.2.0, in [0.2.0](#020).

### Long routines and the timer's controls

- With enough blocks, Play, Next and Finish are pushed below the screen. The fix is planned for milestone 6, when routines long enough to show it can first be built. Both starter routines have one or two blocks.
- The controls will be pinned at the bottom with `position: sticky`, above the phone's tab bar, so they look as they do now when everything fits. Moving them to the top was rejected, because scrolling to a later block would push them off the top instead. A bar that also shows the active time was rejected as more work, showing the time twice.
- When the run moves to a block that's out of view, the page scrolls it into view with `scrollIntoView({ block: 'nearest' })`, which does nothing when every block fits, with a `scroll-margin` clearing the pinned controls. It moves only when the block changes, not every second. The user asked about a scrollable box around the blocks. Page scrolling was recommended instead, because a scroll area inside a scrolling page is awkward on phones.

## Step 1: the base path (`build/base-path`), 2026-11-10

### The base path

- `vite.config.ts` reads SvelteKit's `paths.base` from `BASE_PATH`, or the site's root when it isn't set. It's written as SvelteKit wants it, `/cadoro`, with a leading slash and no trailing one, unlike Vite's `base: '/cadoro/'` in the weight tracker. SvelteKit checks the format itself when it loads the config and stops with a clear error, so the config has no check of its own. A `readBasePath` function with its own check and tests, like `readDevPort`, was planned and dropped as the same rule written twice. The variable's plain `string` is asserted to SvelteKit's `'' | `/${string}`` type, which that check makes safe.
- A third Playwright project, `production`, builds the app at `/cadoro` and serves it with `vite preview` on port 4175, so it never meets an `npm run preview` on 4173. Its server is never reused, so it can't test an old build. It runs only `e2e/production/`, which the desktop and phone projects ignore. Its tests open every screen from its link and from its own address, after a reload too, and fail on any response with an error status. Breaking `resolve()` in `ScreenNav` on purpose failed the link test.
- Its tests navigate with paths relative to `baseURL`, such as `goto('stats')`, because Playwright resolves `/stats` against the host and drops the folder.
- `vite preview` answers every address under the base path with the app, while Pages only serves files, so these tests don't cover Pages' `404.html` fallback. That's checked on Pages itself in step 4.
- The production port is fixed rather than taken from an environment variable like `PORT`, so two worktrees can't run the end-to-end tests at the same time. `strictPort` makes the second one fail loudly rather than test the wrong build, and the README says so.

## Step 2: installable and offline (`feat/offline`), 2026-11-10

### The service worker

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
- **Changed later:** `UpdatePrompt` registers the worker from step 3, in [The reload prompt](#the-reload-prompt).

### The app's icon

- The icon is Lucide's `timer` (ISC licence) in white on a rounded `rose-700` square, the light theme's Play button colours. Brighter `rose-600`, the dark Play button's `rose-400` with a near-black timer, and a `zinc-950` square with a `rose-400` timer were compared in screenshots at real sizes. The dark square nearly vanished on dark tab bars and home screens.
- The timer is centred on a 32-unit square, so its farthest point is 35% of the width from the centre. That's inside the 40% radius Android never crops from a maskable icon.
- `npm run generate-icons` makes every size from `static/favicon.svg` with `@vite-pwa/assets-generator`, configured as in the weight tracker. The maskable and Apple icons fill the whole square. The generated files are committed. The scaffold's Svelte logo is gone.
- The icons' source and licence are in a new Credits section of the README, where milestone 5's chimes will go too.

### The offline test

- `e2e/production/offline.spec.ts` opens the production build once, waits for an active service worker, goes offline, reloads, runs Play, then opens Stats from its link and Settings from its address. Turning off the navigation fallback failed the address step, while the reload of the folder's address still passed, because that address is kept as a file. Skipping registration failed the wait.
- The wait is an `expect.poll` on the worker's state with its own message, so a missing worker fails in 5 seconds and says so, rather than hanging until the test times out.

## Step 3: the reload prompt (`feat/update-prompt`), 2026-11-10

### The reload prompt

- A new version waits for the run. The card is hidden while a run is in progress and shows once it ends, or before Play, since until milestone 4 saves runs a reload would throw the run away. Showing it at once and asking for confirmation on Reload during a run was rejected, as was showing it with Reload disabled. Either would interrupt focused work with something that can't be acted on yet.
- It's a card at the bottom, as in the weight tracker: above the phone's tab bar, in the bottom-right corner from 48rem up, in the page's opposite colours, with Reload and Later. Reload uses the other theme's Play button colours, a pair already checked for contrast. A banner under the header, pushing the screen down, was rejected.
- The browser only looks for a new version when the app opens or reloads. An hourly check while the app stays open, as the plugin's docs suggest, was offered and declined.
- `UpdatePrompt` uses `useRegisterSW` from `virtual:pwa-register/svelte`, the plugin's Svelte helper, as step 2 expected. Its `needRefresh` is a Svelte store, read with `$needRefresh`. Wrapping the plain `registerSW` in a runes class was considered, but it's more code for the same thing. `app.d.ts` now loads the Svelte module's types in place of the plain one's.
- The root layout renders the prompt with `runInProgress={timerSession.view.isInProgress}`, and the prompt registers the worker as it starts, in place of the layout's `onMount`.
- When the new version takes over, the plugin reloads every tab the app has open, not only the one where Reload was pressed, which would throw away a run in another tab. So the prompt passes `onNeedReload`, which reloads only when no run is in progress. A tab that's mid-run remembers that the new version is in control, shows the card once its run ends, and its Reload then just reloads, as no version is left waiting.
- `src/lib/page-reload.ts` holds a one-line `reloadPage()`, so component tests can replace it with `vi.mock`. Chromium doesn't let `location.reload` be replaced: assigning to it is silently ignored, and `Object.defineProperty` throws "Cannot redefine property", which was checked.

### Testing updates

- The component tests fake `useRegisterSW` with real `writable` stores, which a test sets as the plugin would, and keep the options it was given, so a test can call `onNeedReload` itself.
- The planned Playwright journey served a changed `sw.js` through `context.route()`, but Playwright's routing never sees the browser's own update check for the worker's script, which a spike showed. Relying on the component tests and step 5's check on Pages was offered as the alternative and rejected. `@vite-pwa/sveltekit` 2.x is a new rewrite, and only a real browser would catch a change in its update behaviour.
- So `e2e/update-server.ts`, a small Node server, serves the production build at `/cadoro/` on port 4176, and adds a comment to the end of `sw.js` for a browser that sends a `version=next` cookie. Any change to the worker's bytes makes it a new version, so no second build is needed. Node 22.22 runs it straight from TypeScript. Playwright starts it as a third web server, after the production build's, and a fourth project, `updates`, runs `e2e/production/update.spec.ts` against it, which the `production` project ignores.
- The version is chosen per browser context by the cookie, rather than by a switch on the server. A global switch made the copies of `--repeat-each`, which run side by side, flip it on each other.
- A journey first reloads once after the worker installs. On a first visit the page isn't controlled by the worker, which doesn't claim open pages, so a new version activates at once rather than waiting.
- The journeys check that the card shows before Play, goes during the run, and comes back after Finish, then that Reload hands over; that Later puts it off until the next load; and that with two tabs, Reload in one leaves the other's run going until it ends. Checking that the card stayed hidden while a run found the new version was dropped, because Workbox reports a waiting worker 200 ms after it installs, and the check passed before the card could appear even with the rule broken.
- Breaking each rule on purpose failed the journey that guards it: the card ignoring the run, a tab mid-run reloading, and Reload ignoring a version already in control. A Reload that does nothing fails after 5 seconds, as `expect` would, rather than at the test's 30-second timeout. The production and update journeys passed 60 runs at ten repeats each.
- The offline test's wait for an active worker moved to `e2e/service-worker.ts`, which both use.

## Between steps 3 and 4: the Taskfile (`build/taskfile`), 2026-11-10

### The Taskfile

- Workflows that took several commands run from `Taskfile.yml` with go-task, at the user's suggestion: setup, the checks, flakiness repeats, a production preview, the phone, ports, branches, worktrees, CI and merging. It's its own pull request before milestone 3's step 4, so the release and deploy steps there can be written as tasks from the start. Folding it into step 4 was rejected as mixing two topics, and leaving it until after milestone 3 as losing the benefit for step 4.
- The user asked for as much as is logical. Wrappers that only rename an npm script, such as `dev`, `test` or `icons`, were left out as two names for one thing. So was `pr:create`, because a pull request's title and body need writing, and a preview of the update prompt, which would need a cookie set by hand. Screenshots and proving tests by breaking them stay with Claude, as they need judgement. They may become a Claude Code skill later.
- More npm scripts were rejected because each holds one command line, with no descriptions, arguments, checks or loops. Make was rejected for its file-timestamp model and tab-sensitive syntax.
- Tasks call the npm scripts rather than repeating their commands. CI keeps calling npm directly, one step per check, so its failures stay easy to read and it never needs go-task. `check` repeats CI's order, with a comment saying the two must match.
- Every task checks what it needs with `preconditions` or `requires` before doing anything, and says what's wrong: a bad branch name, uncommitted work, a busy port, no phone, no pull request, checks not passed, or a CI image that doesn't match Playwright. Each refusal was triggered on purpose.
- `check:ci-image` compares the Playwright image's tag in `pipeline.yml` with `@playwright/test` in the lockfile, which must be bumped together, and `check` runs it first.
- `branch:delete` and `worktree:done` delete a branch only once every commit is on `main`: inside its history (`git merge-base --is-ancestor`), or, after a rebase merge gives the commits new hashes, with the same change (`git cherry`). The git rules' check, `git diff <branch> origin/main` showing nothing, stops working once `main` moves on after the merge, so the user had the global git rules changed to these two checks. Recreating step 3's branch from its old tip showed `git branch -d` refusing it and the task deleting it. `worktree:done` checks before removing anything, so unmerged work is never left without its worktree.
- `branch:new` and `worktree:new` check the name against the git rules' types, and make the branch with `--no-track`, so a branch made from `origin/main` doesn't take it as its upstream. `worktree:new` copies the git-ignored local settings (`.claude`, `.zed`, `.vscode`, `CLAUDE.local.md`) and runs the worktree's own `task setup`. Until this pull request merges, `main` has no Taskfile, so a worktree from it needed `BASE=build/taskfile`.
- `ci:watch` waits up to 60 seconds for GitHub to start the checks, because `gh pr checks --watch` run straight after a push stopped with "no checks reported", which happened on this pull request.
- Local Playwright runs now write the HTML report too, never opening it by itself, so `task e2e:report` has a report to open. Before, only CI wrote one, and `playwright show-report` found nothing locally yet still exited successfully.
- `ci:report` couldn't be run all the way: CI keeps the report only when a run fails, for 14 days, and no kept run failed in the Playwright tests. Its refusal was checked on a run that failed earlier.
- The Taskfile reads `PORT` as `dev-server.ts` does, and repeats the test ports 4175 and 4176 from `playwright.config.ts` in `ports`, with a note, since YAML can't import them.

## Step 4: the Pages deploy and 0.1.0 (`ci/pages-deploy`), 2026-11-10 and 2026-11-11

### The Pages deploy

- `pipeline.yml` deploys `main` to GitHub Pages in two jobs after `Checks`, as in the weight tracker. `Build for Pages` runs only on a push, so pull requests never deploy. `Deploy to Pages` is the only job given `pages: write` and `id-token: write`, so the job that runs the build's packages never holds the right to publish. It uses the `github-pages` environment, and `concurrency` makes a newer deploy wait rather than cancel one partway through.
- The Pages build runs on the plain runner rather than in Playwright's image, since it needs no browser. It builds again, because `Checks` builds at the site's root, and the production Playwright project builds its own copy inside the tests.
- `BASE_PATH` is `/${{ github.event.repository.name }}`, so a fork gets its own folder, written as SvelteKit wants it, with no trailing slash.
- `404.html` is a copy of the fallback page, since Pages has no route fallback, and serves it for any missing path. SvelteKit's fallback page links its files by absolute paths, such as `/cadoro/_app/…`, which is what lets the copy work at any depth. `vite preview` answers every address itself, so this was checked on a Pages-like Node server in the scratchpad: `/cadoro/stats` came back with status 404 and the Stats screen, and registered the service worker.
- No workflow linter or local runner was installed, so the new jobs first run on `main` after the merge. The pull request shows them as skipped.
- Pages is set to deploy from GitHub Actions, rather than from a branch, since the workflow uploads the site itself.

### Releases

- The release steps are tasks from the start: `release:bump`, `ci:watch-main`, `pages:check` and `release:publish`. The README's Releasing section came forward from step 5, because the tasks exist now and 0.1.0 uses them. Step 5 keeps the version in Settings and the check that an installed copy updates.
- `release:bump LEVEL=…` runs on a pull request's branch and commits `chore(release): X.Y.Z` itself, so its commits have no Claude co-author line. It refuses on `main`, with uncommitted work, or when the branch already bumps the version compared with `main`. Its refusal on `main` was checked in a throwaway worktree of `main`, with go-task's `--taskfile` and `--dir`, because `main`'s own Taskfile doesn't have the task yet.
- `release:publish` tags only on `main`, up to date with GitHub, when the version isn't tagged yet and `main`'s own `CI/CD` run for that commit passed, deploy included. So every tag names code that passed its checks and is live. It fetches first and then calls an internal task, because a task's variables are worked out before its commands run, and its checks have to see GitHub as it is now.
- `release:publish` wasn't run on `main` to test it. `main`'s commit had passed and had no tag, so every check would have let it through and published `v0.0.1`. Its tag check was tested on its own, and its last two refusals are checked after the merge.
- `pages:check` asks GitHub for the site's address rather than naming the account, and takes `SITE_URL` from the environment to check another copy, such as a fork's. A screen's address must answer 404 and be the app's page, found by SvelteKit's start script in the site's folder. The status alone isn't enough, because GitHub's own error page is a 404 too. On the Pages-like server it passed with `404.html` and failed without it, and on the wrong folder.
- `ci:watch-main` finds the run with `gh run list --branch main --event push --commit …`, which leaves out pull requests' runs, and shares `ci:watch`'s 60-second wait for GitHub to start it.
- A pull request that only changes docs or tests doesn't bump the version, since the app it deploys is the same.

### 0.1.0 on real devices

- [v0.1.0](https://github.com/LeonKeithFranco/cadoro/releases/tag/v0.1.0) was released from `main`'s commit `9d53654`, once its run had deployed. Both of `release:publish`'s refusals left over from step 4, a version already tagged and `main` behind GitHub, were seen for real.
- The user installed it from Pages on the desktop and on the phone, and it worked offline on both.

## Step 5: the version in Settings and 0.2.0 (`feat/app-version`), 2026-11-11

### The version in Settings

- Settings shows a muted "Version 0.2.0" line under its placeholder, in the placeholder's colours, smaller and spaced off, as the user chose when the step was planned.
- The version comes from `package.json` through Vite's `define`, as in the weight tracker: `vite.config.ts` imports the file and replaces every `__APP_VERSION__` with the version as a quoted string, and `app.d.ts` declares the name for TypeScript inside `declare global`. SvelteKit's own `version` from `$app/environment` was rejected. It's a build id, the build's timestamp by default, and `@vite-pwa/sveltekit` hashes it, through `_app/version.json`, as the kept fallback page's revision, which was read in its source. Set to the release number, a build whose page changed without a version bump would keep the old page offline, pointing at script files the new worker has deleted.
- The component test renders the Settings page and expects the version read from `package.json` itself, so it doesn't take its expected value from the `define` it checks, and stays right after every bump. Removing the line failed it.
- A dev server started before the config change kept the old `define`, so the page threw on `__APP_VERSION__` and Playwright, reusing it, failed the Settings journeys. The tests passed on a fresh server. A config change like this needs the dev server restarted.

### 0.2.0

- The step is released as 0.2.0, where the plan said 0.1.1. Semantic versioning makes a new feature a minor bump, as the README's release steps say.
- The README's status line no longer names a version, so it doesn't need changing at every release.
- [v0.2.0](https://github.com/LeonKeithFranco/cadoro/releases/tag/v0.2.0) was released from `main`'s commit `21d8bcf` once its run had deployed and `task pages:check` passed.
- Milestone 3's last check was the user's: the installed 0.1.0 on the desktop and the phone offered to reload once 0.2.0 was live, and then showed 0.2.0 in Settings.
