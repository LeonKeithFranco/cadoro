# Decisions: milestone 1, Project setup and CI

The static single-page app, the test projects, and CI with a protected `main`, done on 2026-11-09 in pull requests #2 to #6.

## 2026-11-09

### Project setup

- The build is a single-page app: `adapter-static` with an `index.html` fallback, and SSR turned off in the root layout. Nothing is prerendered, because the data lives in the browser, so the fallback page starts the app for every route. `index.html` was chosen over the adapter's usual `200.html` because static servers serve it at `/` without extra setup. The adapter warns against it only when the homepage is also prerendered. Milestone 3 copies it to `404.html` for Pages.
- Vitest files end in `.test.ts` and Playwright files in `.spec.ts`, as in the weight tracker, rather than the scaffold's Vitest accepting both. Component tests end in `.svelte.test.ts` and run in Chromium, and the rest run in Node.
- The npm scripts use the weight tracker's names, each doing one job, so each CI step shows exactly which check failed.
- `npm run typecheck` runs svelte-check with `--fail-on-warnings`, so Svelte's accessibility and compiler warnings fail the checks rather than piling up. A justified exception is silenced where it occurs with a `svelte-ignore` comment.
- Playwright runs a desktop project (Desktop Chrome) and a phone project (Pixel 7) against the dev server, which starts quickly. A project against a production build comes with the service worker in milestone 3.
- The forms plugin keeps its default `base` strategy, which styles every native control, rather than the `class` strategy, because all of the app's controls should share one look.
- npm's audit warnings stay visible. All 14 are in development tools, with none in what ships (`npm audit --omit=dev`). npm can't ignore single advisories, and `npm audit fix --force` would downgrade to ancient versions. Turning off the audit on install was rejected because it would also hide warnings that matter.
- Editor settings folders, `.vscode` and `.zed`, stay out of git, since editor setup is personal.

### CI

- `pipeline.yml` has one `Checks` job for now, running each npm script as its own step, cheapest first: lint, formatting, types, unit and component tests, the build, then the Playwright tests. The Pages jobs come in milestone 3.
- The `Checks` job runs inside Playwright's container image, which has Chromium and its system packages built in, because component tests need the browser as well as the Playwright tests. The browser was first installed with the Playwright CLI and `--with-deps`, but in two of the first four runs that step took about three minutes, fetching Chromium's fonts with `apt` from a slow Ubuntu mirror, while the tests took about 15 seconds. Caching the browser was rejected because it only saves the browser's download of about 8 seconds, and the `apt` packages can't sensibly be cached. Skipping `--with-deps` and relying on the libraries GitHub's runner happens to have was rejected as fragile. Playwright's GitHub Action is archived. The image's tag must match the locked Playwright version, so the two are bumped together.
- The `Protect main` ruleset matches the weight tracker's. It blocks deleting and force-pushing `main`, requires a pull request with no approvals, because GitHub doesn't let you approve your own pull request, and requires the `Checks` job as reported by GitHub Actions. Branches don't need to be up to date with `main` before merging, because a pull request's run already tests it merged with `main`. Nobody can bypass it, the admin included.
- GitHub deletes a pull request's branch once it merges.
- The check that a failing test blocks a merge used a throwaway draft pull request with a broken component test, closed without merging. It was based on the workflow's branch, because `main` had no workflow yet.
