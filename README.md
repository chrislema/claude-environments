# Delivery Engine

Encoded engineering judgment, packaged as an installable Claude Code plugin.

v1 of this repo was a library of documents describing a delivery environment. v2 makes it
executable: the same judgment, re-homed into the mechanisms that can actually hold it
(see `spec.md` for the full plan and phase status).

## Layout

- `.claude-plugin/plugin.json` — plugin manifest (`delivery-engine`)
- `agents/` — role subagents (planner, architect, engineer, designer, tester, deployer) plus the rubric `judge`
- `commands/` — slash-command workflows: the pipeline (`/deliver`, `/deliver-status`, `/judge`, `/rubric-regression`, `/setup-delivery`) and the v1 role commands (`/plan`, `/architect-review`, `/implement`, `/audit`, `/deploy`, `/handoff`, `/project-readout`)
- `skills/<name>/SKILL.md` — auto-triggering judgment playbooks (17)
- `policy/` — `boundaries.json` (role file boundaries, one machine-readable source) and `events.md` (the trajectory event vocabulary)
- `schemas/` — JSON Schema contracts for the 9 pipeline artifact types
- `checks/` — the rubrics' deterministic check registry as runnable code (`node checks/run-all.mjs` self-tests it)
- `hooks/` + `scripts/` — enforcement hooks (boundary, crypto-guard, event log) and pipeline tooling (`stage.mjs` run state, `aggregate.mjs` judgment arithmetic, exemplar regression)
- `workflows/deliver.js` — the deterministic pipeline orchestrator invoked by `/deliver`
- `templates/` — human-readable artifact shapes, plus `constitution.md` installed by `/setup-delivery`
- `rubrics/` — machine-readable evaluation rubrics: 7 artifact + 6 trajectory, with embedded exemplar regression pairs
- `examples/` — a sample vision.md + spec.md pair sized for an end-to-end run
- `CLAUDE.md` — the constitution (this repo's own operating rules)
- `CHRIS-BUILD-PHILOSOPHY.md` — the philosophy the constitution distills

## The sorting principle

Every rule lives in exactly one mechanism:

1. **Deterministic and blockable** → hooks (file ownership, crypto policy, evidence-before-complete)
2. **Judgment, gradeable** → rubric judges at stage gates
3. **Judgment, generative** → skills and agent prompts

The goal is unchanged from v1: preserve durable engineering judgment. What changed is that
the judgment now enforces, grades, and drives — instead of hoping to be remembered.
