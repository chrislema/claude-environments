---
description: Install the delivery-engine constitution and run scaffolding into the current repo.
argument-hint: []
---

Set up this repo to use the delivery-engine pipeline.

Procedure:

1. If the repo has no `CLAUDE.md`, copy the plugin's `templates/constitution.md` to
   `CLAUDE.md`. If a `CLAUDE.md` exists, show the user the constitution and append it
   only with their approval — never overwrite their instructions.

2. Add `.delivery/` to `.gitignore` if not present (run state is local, not committed).

3. Verify the plugin's hooks are active: check that a PreToolUse hook for
   boundary-check and crypto-guard is registered (plugin hooks load automatically when
   the plugin is enabled — if they are not visible, tell the user to re-enable the
   plugin).

4. Sanity-check the toolchain: `node <plugin>/checks/run-all.mjs` must exit 0 and
   `node <plugin>/scripts/aggregate.test.mjs` must exit 0. Report failures instead of
   proceeding.

5. Greenfield only: offer to scaffold the Workers-first baseline. If the repo has no
   `wrangler.jsonc`, you may run
   `node <plugin>/scripts/scaffold.mjs --name=<worker-name> --out=. --flags=<comma-list>`
   (flags from `<plugin>/scaffold/profiles/flags.json`) to materialize `src/`, `public/`,
   `wrangler.jsonc`, `package.json`, the vitest smoke test, and a `scaffold-manifest.json`.
   The scaffold never overwrites existing files. Do this only with the user's confirmation.
   (During a `/deliver` run the pipeline scaffolds from the plan's `scaffold_profile`
   automatically — this step is for setting up a repo by hand.)

6. Tell the user the entry points: `/deliver vision.md spec.md`, `/deliver-status`,
   `/judge`, `/rubric-regression`, and the v1 role commands (`/plan`, `/implement`,
   `/audit`, `/deploy`).
