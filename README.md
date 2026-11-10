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

| Command                | What it does                                           |
| ---------------------- | ------------------------------------------------------ |
| `npm test`             | Unit and component tests, once                         |
| `npm run test:watch`   | The same, rerunning on every save                      |
| `npm run test:e2e`     | Playwright tests, desktop and phone, on the dev server |
| `npm run typecheck`    | Types and Svelte warnings, with svelte-check           |
| `npm run lint`         | ESLint                                                 |
| `npm run format`       | Formats every file with Prettier                       |
| `npm run format:check` | Checks the formatting without changing anything        |
| `npm run build`        | Builds the static site into `build/`                   |
| `npm run preview`      | Serves the build locally                               |

## Licence

[MIT](LICENSE)
