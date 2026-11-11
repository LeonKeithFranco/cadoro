# Decisions

The decision log: what was decided as Cadoro was built, why, and the options rejected along the way. There's one file per milestone, so a session reads only the milestone it's working on, and finds older decisions by searching the folder.

## Files

- `00-spec-and-plan.md`: the conversation that wrote the spec and plan. The timer model, leaving and returning, alerts, stats, screens, the name and repo, the stack, the docs, and planning each step.
- `01-project-setup-and-ci.md`: the static single-page app, test file names, the npm scripts, audit warnings, and CI in Playwright's image with the `Protect main` ruleset.
- `02-run-a-routine.md`: doc comments, the run engine, the position label, code style, the app shell, the theme, SvelteKit's generated types, the timer screen, the cycle counter, the live timer, Svelte state, testing the timer, durations in tests, the dev server's port, the Finish confirmation, the run summary, dialogs, and Playwright on a controlled clock.
- `03-pwa-and-github-pages.md`: milestone 3's steps, long routines, the base path, the service worker, the icon, the offline test, the reload prompt, testing updates, the Taskfile, the Pages deploy, releases, and 0.1.0 and 0.2.0 on real devices.

## Adding a decision

- Add it to the current milestone's file as a `###` topic with bullets, under its step's heading, such as `## Step 2: the app shell (feat/app-shell), 2026-11-10`. Work before a milestone's first step goes under `## Planning`, and work between steps under `## Between steps 3 and 4`, with its branch.
- Start a milestone's file with its first decision, named after the milestone, such as `04-keep-runs.md`, and list it above.
- Say what was decided and why, and which options were rejected and why.
- Keep entries in the order the work happened, oldest first, so a file reads as the milestone's story.
- When a later decision changes an earlier one, add the new one where it's made, and leave the old one as it was, with a last bullet pointing to the change, such as `**Changed later:** step 5 was released as 0.2.0, in [0.2.0](#020).` Architecture decision records do the same: a superseded record is kept and points to its replacement, so the log shows how the project got where it is.
- A fact recorded wrongly is corrected in place, saying what it first said, as the position label entry in `02-run-a-routine.md` does.
