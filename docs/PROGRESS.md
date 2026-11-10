# Progress

**Current status:** The project builds as a static single-page app with `adapter-static`: SvelteKit 3, Svelte 5, strict TypeScript, Tailwind CSS 4 with the forms plugin, Vitest with browser mode, Playwright, ESLint and Prettier. The only page is a placeholder, with a component test and a Playwright test that runs on desktop and phone projects. The npm scripts match the weight tracker's. There's no CI yet.

**Next:** Milestone 1's step 3: the checks workflow, the ruleset protecting `main`, and checking that a failing test blocks a merge.

**In progress:** Milestone 1, project setup and CI. Step 1, setting up the static single-page app, is merged. Step 2, the npm scripts and the Playwright projects in `e2e/`, is on the `test/e2e-projects` branch.

Decisions and their reasons are in `docs/DECISIONS.md`.

## Milestones

### Phase 1: Pipeline

- [ ] 1. Project setup and CI

### Phase 2: Slices

- [ ] 2. Run a routine
- [ ] 3. PWA and GitHub Pages
- [ ] 4. Keep runs
- [ ] 5. Alerts and Settings
- [ ] 6. Routines
- [ ] 7. Stats
- [ ] 8. Backup and activity log

### Phase 3: Release

- [ ] 9. Release 1.0

### Phase 4: Optional

- [ ] 10. Web Push
- [ ] 11. Container image and homelab
