# Progress

**Status:** milestone 8 is done, as version 0.10.0, which goes live once its pull request merges. Settings has a Data card that exports every work period as a CSV, backs everything up as a JSON file and imports a backup after showing what it holds, and an activity log page that lists the changes, imports and errors and exports them as JSON. Every failed save or read and every uncaught error is recorded in the log. Version 0.9.0 (Stats) is live. The app is installed on the desktop and the phone, runs both starter routines, works offline, keeps its data in IndexedDB, restores a run after a reload, and shows the same run in every tab.

**Next:** the test coverage audit (`test/coverage-audit`), then milestone 9, Release 1.0 (`docs/release-1-0`, 1.0.0). `docs/PLAN.md` has the plan for every remaining milestone. Device checks pending: a backup made on one device importing into another; dragging routines and blocks by touch on the phone, and the pinned controls above the tab bar on a long routine; killing the installed app mid-run and reopening it finds the run paused at about the moment it was left; a chime plays on time in a background desktop tab; the phone's screen stays on during a run; and the four chimes sound right by ear.

**Open:**

- Storage has no guard against editing or deleting the running routine, which only the Routines screen stops. Milestone 9's spec sweep can decide whether it needs one.
- Banking unused break time is an open spec item, to revisit after using the app.
- Node 22 is supported until April 2027, so it needs moving to a newer LTS before then.

## Milestone 4: Keep runs

1. [x] Routines in storage (`feat/routine-storage`), 0.3.0: the storage interface, its Dexie and in-memory backends, schema version 1, the starter routines created once on first launch, and the app loading them before it renders
2. [x] Record runs (`feat/run-records`), 0.4.0: each run and work period saved as it starts and ends, and persistent storage asked for
3. [x] Keep the run in progress (`feat/restore-run`), 0.5.0: saved on every change, every second and as the page is hidden, and restored paused at the last heartbeat
4. [x] Share the run across tabs (`feat/shared-run`), 0.6.0: every tab following the saved run through a Dexie live query, with saves refused when a tab is out of date

## Milestones

Each finished milestone lists its steps' branches. Its decisions are in its file in `docs/decisions/`.

### Phase 1: Pipeline

- [x] 1. Project setup and CI: `build/static-spa-setup`, `test/e2e-projects`, `ci/checks-workflow`, `ci/playwright-container`

### Phase 2: Slices

- [x] 2. Run a routine: `build/lint-doc-comments`, `feat/run-engine`, `feat/app-shell`, `build/dev-server-port`, `feat/timer-screen`, `feat/run-summary`
- [x] 3. PWA and GitHub Pages: `build/base-path`, `feat/offline`, `feat/update-prompt`, `build/taskfile`, `ci/pages-deploy` (0.1.0), `feat/app-version` (0.2.0)
- [x] 0. Guardrails and the new workflow: `build/agent-guardrails` (0.5.1)
- [x] 4. Keep runs: `feat/routine-storage` (0.3.0), `feat/run-records` (0.4.0), `feat/restore-run` (0.5.0), `feat/shared-run` (0.6.0)
- [x] 5. Alerts and Settings: `feat/alerts-and-settings` (0.7.0)
- [x] 6. Routines: `feat/routines` (0.8.0)
- [x] 7. Stats: `feat/stats` (0.9.0)
- [x] 8. Backup and activity log: `feat/backup-and-log` (0.10.0)

### Phase 3: Release

- [ ] Before 9. Test coverage audit: `test/coverage-audit` (0.10.1, or no bump)
- [ ] 9. Release 1.0: `docs/release-1-0` (1.0.0)

### Phase 4: Optional

- [ ] 10. Web Push
- [ ] 11. Container image and homelab
