# Delivery Engine

Encoded engineering judgment, packaged as an installable Claude Code plugin.

v1 was a library of documents describing a delivery environment. v2 made it executable —
judgment re-homed into mechanisms that can hold it. **v3 makes the evidence real:** the release
gate is synthesized from executed proof (not narrated), the Cloudflare topology is Workers-first,
and the harness is deterministically product-blind. See `spec-v3.md` for the full plan.

## The three theses

- **T1 — Facts are computed; judgments are judged.** If a pipeline output is a fact about the
  world (does this config parse, did this probe return 200, what files exist), code produces and
  checks it. If it is a judgment (is this plan coherent, is this proof sufficient), a model
  produces it and a judge grades it.
- **T2 — The deterministic path is deterministic end-to-end.** No model token generation sits
  between a check's execution and the file a gate reads. Agents launch commands; they never
  transcribe results.
- **T3 — The harness is product-blind.** The engine knows Cloudflare, Wrangler, HTTP, SQL, and its
  own artifact vocabulary — never a product's routes, tables, or nouns. Product enters a run
  through three doors: the vision/spec, the judged plan, and the judged probe plan.

## The pipeline (`/deliver vision.md spec.md`)

```
readout (planner)
  → task plan + scaffold profile (planner) → plan gate-set + rubric judge → bounce/PASS
  → architect review → review judge → bounce (remediation injected) / block → plan re-gated+re-judged
  → scaffold (CODE: scaffold.mjs materializes the Workers target; manifest → readonly baseline)
  → build loop (engineer/designer → gate-set → implementation judge → classified retry / STUCK)
  → tester authors probe-plan + vitest (judged) → evidence.mjs executes the chain (CODE)
     → synthesize-gate.mjs builds release-gate.json (CODE) → deterministic release gate-set
  → deploy (local | staging | production: versions upload → probe → approval → gradual promote
     → post-promote probe; report synthesized by CODE, rollback a recorded fact)
```

Every fact was computed, executed, or synthesized by code; every deterministic result reached its
gate without passing through a model; the run is reconstructable from `.delivery/` alone.

## The sorting principle

Every rule lives in exactly one mechanism:

1. **Deterministic and blockable** → a hook or check (`scripts/boundary-check.mjs`,
   `scripts/crypto-guard.mjs`, `checks/checks.mjs` + `checks/gate-sets.json`).
2. **Judgment, gradeable** → a rubric judge at a stage gate (`rubrics/`, `scripts/aggregate.mjs`).
3. **Judgment, generative** → a skill or agent prompt (`skills/`, `agents/`).

A rule encoded in two places drifts into two rules.

## Layout

- `agents/` — role subagents (planner, architect, engineer, designer, tester, deployer) + the `judge`
- `commands/` — the pipeline (`/deliver`, `/deliver-status`, `/judge`, `/rubric-regression`,
  `/calibration-report`, `/promote-exemplar`, `/setup-delivery`) and the v1 role commands
- `policy/` — `settled.json` (versioned settled policy, S-001…S-006), `boundaries.json` (role globs),
  `events.md` (trajectory event contract), `engine-vocabulary.json` (product-blindness allowlist)
- `scaffold/` + `scripts/scaffold.mjs` — the Workers-first scaffold engine and its flag registry
- `scripts/` — pipeline tooling: `stage.mjs` (run state), `aggregate.mjs`, `evidence.mjs`,
  `synthesize-gate.mjs`, `deploy-report.mjs`, `classify-failure.mjs`, `calibration.mjs`, and tests
- `checks/` — the deterministic check registry (`checks.mjs`), the CLI + gate-set runner (`run.mjs`),
  the per-stage gate-sets (`gate-sets.json`), and the self-test harness (`run-all.mjs`)
- `hooks/` — PreToolUse boundary + crypto hooks (now shell-covered) and the PostToolUse event log
- `workflows/deliver.js` — the deterministic pipeline orchestrator
- `rubrics/` — evaluation rubrics (artifact + trajectory) with embedded exemplar-regression pairs
- `schemas/`, `templates/`, `examples/`, `docs/RUNS.md` (run journal), `CLAUDE.md` (the constitution)

## Test gates

`node checks/run-all.mjs` and the `scripts/*.test.mjs` suites must exit 0 before committing;
`/rubric-regression` must be TRUSTED when a rubric or the judge changes. See CLAUDE.md →
Maintaining the engine.
