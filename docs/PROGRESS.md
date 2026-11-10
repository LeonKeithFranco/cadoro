# Progress

**Current status:** The project builds as a static single-page app with `adapter-static`: SvelteKit 3, Svelte 5, strict TypeScript, Tailwind CSS 4 with the forms plugin, Vitest with browser mode, Playwright, ESLint and Prettier. The only page is a placeholder, with a component test and a Playwright test that runs on desktop and phone projects. The npm scripts match the weight tracker's. Milestone 1 is done: every pull request runs the `Checks` job in GitHub Actions, and the `Protect main` ruleset only lets a pull request merge once it passes. Merged branches are deleted automatically.

**Next:** Milestone 2, run a routine, starting in plan mode with its steps and the first step's rounds.

**In progress:** Nothing.

Decisions and their reasons are in `docs/DECISIONS.md`.

## Milestones

### Phase 1: Pipeline

- [x] 1. Project setup and CI

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
