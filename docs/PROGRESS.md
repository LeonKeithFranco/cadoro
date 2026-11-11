# Progress

**Status:** version 0.2.0 is live on GitHub Pages, installed on the desktop and the phone. It runs both starter routines through work, overtime, breaks and Finish, works offline, and offers to reload when a new version is ready. Nothing is saved yet: a reload loses the run, and the starter routines are made afresh on every load.

**Next:** milestone 4, Keep runs, step 1, routines in storage (`feat/routine-storage`). The milestone is planned and approved, with its reasons in `docs/decisions/04-keep-runs.md`.

**Open:**

- Milestone 6 also pins the timer's controls for long routines, as planned in `docs/decisions/03-pwa-and-github-pages.md`.
- Banking unused break time is an open spec item, to revisit after using the app.
- Node 22 is supported until April 2027, so it needs moving to a newer LTS before then.

## Milestone 4: Keep runs

1. [ ] Routines in storage (`feat/routine-storage`), 0.3.0: the storage interface, its Dexie and in-memory backends, schema version 1, the starter routines created once on first launch, and the app loading them before it renders
2. [ ] Record runs (`feat/run-records`), 0.4.0: each run and work period saved as it starts and ends, and persistent storage asked for
3. [ ] Keep the run in progress (`feat/restore-run`), 0.5.0: saved on every change and every second, and restored paused at the last heartbeat
4. [ ] Share the run across tabs (`feat/shared-run`), 0.6.0: every tab following the saved run through a Dexie live query

## Milestones

Each finished milestone lists its steps' branches. Its decisions are in its file in `docs/decisions/`.

### Phase 1: Pipeline

- [x] 1. Project setup and CI: `build/static-spa-setup`, `test/e2e-projects`, `ci/checks-workflow`, `ci/playwright-container`

### Phase 2: Slices

- [x] 2. Run a routine: `build/lint-doc-comments`, `feat/run-engine`, `feat/app-shell`, `build/dev-server-port`, `feat/timer-screen`, `feat/run-summary`
- [x] 3. PWA and GitHub Pages: `build/base-path`, `feat/offline`, `feat/update-prompt`, `build/taskfile`, `ci/pages-deploy` (0.1.0), `feat/app-version` (0.2.0)
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
