# Cadoro

A self-hostable timer for focused work, built as a SvelteKit PWA. Routines are made of blocks; work counts up past its target, and each break is earned as a percentage of the time worked. Data stays in the browser, and there's no backend.

**Status:** in development. There's no usable app yet. [`docs/PROGRESS.md`](docs/PROGRESS.md) has the current state.

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

The dev server and the Playwright tests use port 5173, or `PORT` when it's set. In a second git worktree, give each command its own port, such as `PORT=5174 npm run test:e2e`, or Playwright will test the first worktree's server. The production build that `npm run test:e2e` tests always uses port 4175, and stops with an error if it's busy, so run the end-to-end tests in one worktree at a time.

| Command                | What it does                                                                                   |
| ---------------------- | ---------------------------------------------------------------------------------------------- |
| `npm test`             | Unit and component tests, once                                                                 |
| `npm run test:watch`   | The same, rerunning on every save                                                              |
| `npm run test:e2e`     | Playwright tests, desktop and phone, on the dev server, and on a production build at `/cadoro` |
| `npm run typecheck`    | Types and Svelte warnings, with svelte-check                                                   |
| `npm run lint`         | ESLint                                                                                         |
| `npm run format`       | Formats every file with Prettier                                                               |
| `npm run format:check` | Checks the formatting without changing anything                                                |
| `npm run build`        | Builds the static site into `build/`                                                           |
| `npm run preview`      | Serves the build locally                                                                       |

`npm run build` builds for the root of a site. To serve the app from a folder, as GitHub Pages does, set `BASE_PATH` to that folder, starting with `/` and without a trailing slash:

```sh
BASE_PATH=/cadoro npm run build
```

## Licence

[MIT](LICENSE)
