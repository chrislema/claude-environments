# Delivery Engine

Encoded engineering judgment, packaged as an installable Claude Code plugin.

v1 of this repo was a library of documents describing a delivery environment. v2 makes it
executable: the same judgment, re-homed into the mechanisms that can actually hold it
(see `spec.md` for the full plan and phase status).

## Layout

- `.claude-plugin/plugin.json` — plugin manifest (`delivery-engine`)
- `agents/` — role subagents: planner, architect, engineer, designer, tester, deployer
- `commands/` — slash-command workflows (`/plan`, `/architect-review`, `/implement`, `/audit`, `/deploy`, `/handoff`, `/project-readout`)
- `skills/<name>/SKILL.md` — auto-triggering judgment playbooks (17)
- `policy/boundaries.json` — role file boundaries and turn budgets, one machine-readable source
- `templates/` — human-readable artifact shapes (plans, handoffs, reports, gates)
- `rubrics/` — machine-readable evaluation rubrics: 7 artifact + 6 trajectory, with embedded exemplar regression pairs
- `CLAUDE.md` — the constitution (this repo's own operating rules)
- `CHRIS-BUILD-PHILOSOPHY.md` — the philosophy the constitution distills

Arriving per `spec.md`:

- `schemas/` — JSON Schema contracts for pipeline artifacts (P2)
- `checks/` — deterministic check registry as runnable scripts (P2)
- `hooks/` + `scripts/` — enforcement hooks: boundary, crypto-guard, event log (P3)
- `/judge` + exemplar regression — rubric-driven stage gates (P4)
- `/deliver` — the autonomous vision.md + spec.md → shipped-software loop (P5)

## The sorting principle

Every rule lives in exactly one mechanism:

1. **Deterministic and blockable** → hooks (file ownership, crypto policy, evidence-before-complete)
2. **Judgment, gradeable** → rubric judges at stage gates
3. **Judgment, generative** → skills and agent prompts

The goal is unchanged from v1: preserve durable engineering judgment. What changed is that
the judgment now enforces, grades, and drives — instead of hoping to be remembered.
