# Cadoro

A self-hostable timer for focused work, built as a SvelteKit PWA. Routines are made of blocks; work counts up past its target, and each break is earned as a percentage of the time worked. Data stays in the browser, and there's no backend.

**Status:** in development. Version 0.1.0 runs the two starter routines, installs as an app and works offline, at **[leonkeithfranco.github.io/cadoro](https://leonkeithfranco.github.io/cadoro/)**. Nothing is saved yet. [`docs/PROGRESS.md`](docs/PROGRESS.md) has the current state.

## Docs

- [`docs/SPEC.md`](docs/SPEC.md): what the app does
- [`docs/PLAN.md`](docs/PLAN.md): the stack and the milestones
- [`docs/DECISIONS.md`](docs/DECISIONS.md): every decision, with its reasons

## Stack

SvelteKit with `adapter-static`, Svelte 5, strict TypeScript, Tailwind CSS 4, Vitest with browser mode, and Playwright.

## Development

Needs the Node version in [`.nvmrc`](.nvmrc).

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

## Licence

[MIT](LICENSE)
