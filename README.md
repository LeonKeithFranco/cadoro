# Cadoro

A self-hostable timer for focused work, built as a SvelteKit PWA. Routines are made of blocks; work counts up past its target, and each break is earned as a percentage of the time worked. Data stays in the browser, and there's no backend.

Use it at **[leonkeithfranco.github.io/cadoro](https://leonkeithfranco.github.io/cadoro/)**, or [host your own copy](#self-hosting). [`docs/SPEC.md`](docs/SPEC.md) says exactly what the app does.

## Installing

Open the site in a browser. To install it as an app:

- **Desktop (Chrome, Edge):** click the install icon in the address bar, or use the browser menu's "Install Cadoro".
- **Android (Chrome):** the menu's "Install app" or "Add to Home screen".
- **iPhone (Safari):** Share, then "Add to Home Screen". Safari offers no install button.

It works offline after the first load. When a new version is ready, a card offers to reload, and it never reloads by itself during a run.

## Using it

- **Routines:** a routine is a list of up to 20 blocks, each with a work target in minutes, a break percentage and a number of cycles. It repeats a set number of rounds, or forever. The Routines screen creates, edits, duplicates, deletes and reorders them, and sorts the list. Two starter routines are there on the first launch.
- **The timer:** pick a routine on the Timer screen and press Play. Work counts up from 0:00 and keeps counting past its target, turning amber as overtime, with a chime at the target. Next ends the work period and starts its break, Pause stops the clock, and Finish ends the run, with a summary. Switching to another screen pauses the run, and a reload restores it paused at its last moment.
- **Breaks earned:** a break is the block's percentage of the time you actually worked, so longer work earns a longer break. It counts down, chimes at 0:00, and waits for Play. Next during a break banks the time left, which is added to the next break.
- **Several tabs:** every tab shows the same run, and each work period is recorded once.
- **Stats:** today, a daily chart over a chosen range, weekly and monthly totals, all-time totals per routine, streaks, time against target and targets reached, for every routine or one.
- **Settings:** the theme, a chime for each alert with a preview, the volume, keeping the screen awake during a run, the persistent storage status, the data tools and the app's version.
- **Backup and import:** the Data card in Settings has **Export work periods (CSV)**, which downloads every work period as a spreadsheet, and **Back up (JSON)**, which downloads your routines, runs, work periods and settings as one file. **Import a backup** shows what a file holds and, once you confirm, replaces all your data with it, including a run in progress. A file that isn't a valid backup is turned away and nothing changes.
- **The activity log:** a page linked from the Data card, listing routine changes, imports and errors, newest first, which can be downloaded too. It never leaves the device.

## Your data

- Everything stays in your browser, in its IndexedDB. There's no account and no server that sees it.
- Phone and desktop hold separate data. The JSON backup is the only way to move it.
- Clearing site data, uninstalling the app or changing devices deletes it. The app asks the browser for persistent storage once work is saved, which keeps the browser from clearing it when space is low, but it doesn't protect against you clearing it. Back up.
- Data belongs to the browser and the exact site address, so a copy at a different address starts empty.
- Chimes can't be relied on while the phone is locked or the app is closed, since a static app can't run on a schedule without a server. Keep the app open, with the screen awake.

## Self-hosting

Cadoro is static files, so any web server can serve them.

1. Build it for the root of a site, with `BASE_PATH` unset (see [Development](#development) for Node):

   ```sh
   npm ci
   npm run build
   ```

2. Serve the `build/` folder. The server must answer every address that isn't a file with `index.html`, so reloading a screen's address, such as `/settings`, still works. Off `localhost`, it needs HTTPS, or the service worker won't run and the app can't be installed.

   With Caddy, a `Caddyfile` such as:

   ```caddyfile
   example.com {
   	root * /srv/cadoro
   	try_files {path} /index.html
   	file_server
   }
   ```

   With nginx:

   ```nginx
   location / {
   	root /srv/cadoro;
   	try_files $uri /index.html;
   }
   ```

   Or with Podman, serving over plain HTTP on port 8080, for `localhost` or behind your own HTTPS proxy. Put this in a `Caddyfile`:

   ```caddyfile
   :80 {
   	root * /srv
   	try_files {path} /index.html
   	file_server
   }
   ```

   then run:

   ```sh
   podman run --rm -p 8080:80 -v ./build:/srv:ro,Z -v ./Caddyfile:/etc/caddy/Caddyfile:ro,Z docker.io/library/caddy:2
   ```

To serve from a folder instead, build with `BASE_PATH=/folder` and serve it there.

## Development

Needs the Node version in [`.nvmrc`](.nvmrc), which is Node 22.

```sh
npm ci                            # install the exact versions in the lockfile
npx playwright install chromium   # once, for the browser tests
npm run dev                       # dev server at http://localhost:5173
```

The dev server and the Playwright tests use port 5173, or `PORT` when it's set. In a second git worktree, give each command its own port, such as `PORT=5174 npm run test:e2e`, or Playwright will test the first worktree's server. The production build that `npm run test:e2e` tests always uses port 4175, and the update tests' server, which serves the same build, uses 4176. Each stops with an error if its port is busy, so run the end-to-end tests in one worktree at a time.

| Command                  | What it does                                                                                   |
| ------------------------ | ---------------------------------------------------------------------------------------------- |
| `npm test`               | Unit and component tests, once                                                                 |
| `npm run test:watch`     | The same, rerunning on every save                                                              |
| `npm run test:e2e`       | Playwright tests, desktop and phone, on the dev server, and on a production build at `/cadoro` |
| `npm run typecheck`      | Types and Svelte warnings, with svelte-check                                                   |
| `npm run lint`           | ESLint                                                                                         |
| `npm run format`         | Formats every file with Prettier                                                               |
| `npm run format:check`   | Checks the formatting without changing anything                                                |
| `npm run build`          | Builds the static site into `build/`                                                           |
| `npm run preview`        | Serves the build locally                                                                       |
| `npm run generate-icons` | Makes every icon size in `static/` from `static/favicon.svg`                                   |

`npm run build` builds for the root of a site. To serve the app from a folder, as GitHub Pages does, set `BASE_PATH` to that folder, starting with `/` and without a trailing slash:

```sh
BASE_PATH=/cadoro npm run build
```

## Tasks

[`Taskfile.yml`](Taskfile.yml) runs the workflows that take several commands, with [go-task](https://taskfile.dev). Install it from your package manager. Fedora calls the command `go-task` rather than `task`, so either use that name or alias it. `task` lists every task, and `task --summary <name>` shows a task's longer help. Tasks call the npm scripts above rather than repeating them, and CI calls the npm scripts directly.

| Task                                          | What it does                                                                                    |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `task setup`                                  | Installs the locked dependencies and Playwright's Chromium                                      |
| `task check`                                  | Every check CI runs, in CI's order, plus `check:ci-image`                                       |
| `task check:quick`                            | Lint, formatting, types, and unit and component tests, in seconds                               |
| `task check:ci-image`                         | Checks that CI's Playwright image matches the Playwright version in the lockfile                |
| `task fix`                                    | Formats every file, fixes what ESLint can, and lists the changed files                          |
| `task audit`                                  | Known vulnerabilities in what the app ships                                                     |
| `task clean`                                  | Deletes the build and the test results                                                          |
| `task e2e:repeat TIMES=20 -- --project phone` | Runs the Playwright tests many times to catch flaky ones                                        |
| `task e2e:report`                             | Opens the last Playwright report, with the traces of failed tests                               |
| `task preview:production`                     | Builds the app at `/cadoro`, as Pages serves it, and serves it on port 4199                     |
| `task dev:phone`                              | Runs the dev server for a phone on USB, through `adb reverse`                                   |
| `task ports`                                  | Shows what's listening on each of the project's ports                                           |
| `task branch:new BRANCH=feat/run-history`     | Starts a branch from the latest `main`, checking its name                                       |
| `task branch:delete BRANCH=…`                 | Deletes a local branch once every commit is on `main`, including after a rebase merge           |
| `task worktree:new NAME=… BRANCH=…`           | Makes a worktree in `../<repo>-worktrees/`, copies the local settings and sets it up            |
| `task worktree:done NAME=…`                   | Removes a worktree and its branch, once its work is committed and on `main`                     |
| `task ci:watch`                               | Watches the pull request's checks until they finish                                             |
| `task ci:watch-main`                          | Watches the CI/CD run on `main`'s newest commit, deploy included, until it finishes             |
| `task ci:logs`                                | Shows the failed steps' log from the branch's latest CI run                                     |
| `task ci:report`                              | Downloads and opens CI's Playwright report from a failed run                                    |
| `task pr:merge`                               | Rebase-merges the pull request once its checks pass, then updates `main` and deletes the branch |
| `task release:bump LEVEL=minor`               | Bumps the version on the pull request's branch, once, and commits it                            |
| `task pages:check`                            | Checks that the live site answers, including a screen's address through `404.html`              |
| `task release:publish`                        | Tags `main` with the version and publishes the release, once `main`'s CI/CD run has passed      |

Each task checks what it needs before doing anything, such as a free port or no uncommitted work, and says what's wrong if it can't go ahead.

## Releasing

Every push to `main` that passes the checks deploys the app to GitHub Pages. So every pull request that changes the app bumps the version once, and its merged commit is tagged and released. A pull request that only changes docs or tests doesn't, since it deploys the same app.

Versions follow [semantic versioning](https://semver.org/). Until 1.0.0, a new feature bumps the minor number and anything else, such as a fix or a dependency update, the patch number. From 1.0.0, a change that stops old data or backups working bumps the major number.

1. On the pull request's branch, once its other commits are in, bump the version, such as `task release:bump LEVEL=minor`. It commits `package.json` and `package-lock.json` as `chore(release): 0.2.0`.
2. Merge the pull request once its checks pass, with `task ci:watch` then `task pr:merge`.
3. Wait for the `CI/CD` run on `main` to pass and deploy, with `task ci:watch-main`. If it fails, fix it in a new pull request without bumping the version again, since that version never went live, and release the fix's merged commit instead.
4. Check the live site with `task pages:check`.
5. Tag `main` and publish the release with `task release:publish`. It refuses unless `main`'s run for that commit passed and the version isn't tagged yet, so every tag names code that passed its checks and is live.

## Credits

- **Icons:** the navigation icons and the app's icon come from [Lucide](https://lucide.dev), under the [ISC licence](https://github.com/lucide-icons/lucide/blob/main/LICENSE). The app's icon is Lucide's [`timer`](https://lucide.dev/icons/timer) on a rose square.
- **Chimes:** the four bell dings in `static/chimes/` come from PWL's [Bell dings/chimes](https://opengameart.org/content/bell-dingschimes) on OpenGameArt, under [CC0 1.0](http://creativecommons.org/publicdomain/zero/1.0/). They are trimmed, converted to MP3 and set to the same loudness. [`static/chimes/SOURCES.md`](static/chimes/SOURCES.md) has the details.

## Licence

[MIT](LICENSE)
