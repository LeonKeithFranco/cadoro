# Progress

**Status:** milestone 5 is done, as version 0.7.0, which goes live once its pull request merges. Chimes sound when a work period reaches its target and when a break ends, in one tab, and Settings sets the theme, each alert's chime, the volume, keeping the screen awake and shows whether storage is persistent; the Timer opens on the last routine used. Version 0.6.0 (milestone 4's step 4) is live. Milestone 0 (guardrails and the new workflow, `build/agent-guardrails`, 0.5.1) comes before it. The app is installed on the desktop and the phone. It runs both starter routines through work, overtime, breaks and Finish, works offline, and offers to reload when a new version is ready. The starter routines are saved in IndexedDB on the first launch, every run and work period is saved as it starts and ends, and persistent storage is asked for once work is saved. The run in progress is saved on every change, every second while counting and as the page is hidden, and a reload restores it paused at that moment. Every tab shows the same run: a press in one shows in the others, and a tab opened mid-run joins it without pausing it.

**Next:** milestone 6, Routines (`feat/routines`, 0.8.0). `docs/PLAN.md` has the plan for every remaining milestone. Device checks pending: killing the installed app mid-run and reopening it finds the run paused at about the moment it was left; a chime plays on time in a background desktop tab; the phone's screen stays on during a run; and the four chimes sound right by ear.

**Open:**

- Milestone 6 also pins the timer's controls for long routines, as planned in `docs/decisions/03-pwa-and-github-pages.md`.
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
- [ ] 6. Routines: `feat/routines` (0.8.0)
- [ ] 7. Stats: `feat/stats` (0.9.0)
- [ ] 8. Backup and activity log: `feat/backup-and-log` (0.10.0)

### Phase 3: Release

- [ ] 9. Release 1.0: `docs/release-1-0` (1.0.0)

### Phase 4: Optional

- [ ] 10. Web Push
- [ ] 11. Container image and homelab
