# Progress

**Status:** 1.0.0 is live. 1.2.0 adds the banked break: Next during a break banks the time left into the next break. 1.2.1 is the refactoring sweep, which removes duplication and dead code, with a few fixes. 1.2.2 makes the Stats range buttons fit on phones. The spec is complete: Cadoro runs routines of blocks with work that counts up and earned breaks, keeps its data in IndexedDB, shares one run across tabs, chimes, shows stats, backs up and imports, and keeps an activity log. It works offline and is installed on the desktop and the phone.

**Next:** the device checks listed in `docs/decisions/09-release-1-0.md`, then the optional milestones 10 and 11.

**Open:**

- Node 22 is supported until April 2027, so it needs moving to a newer LTS before then, once Fedora ships one.

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

- [x] Before 9. Test coverage audit: `test/coverage-audit` (shipped inside 1.0.0)
- [x] 9. Release 1.0: `docs/release-1-0` (1.0.0)
- [x] After 9. Break preview: `feat/break-preview` (1.1.0)
- [x] After 9. Banked break: `feat/banked-break` (1.2.0)
- [x] After 9. Refactoring sweep: `refactor/duplication-and-dead-code` (1.2.1)
- [x] After 9. Stats range buttons on phones: `fix/stats-range-buttons-fit` (1.2.2)

### Phase 4: Optional

- [ ] 10. Web Push
- [ ] 11. Container image and homelab
