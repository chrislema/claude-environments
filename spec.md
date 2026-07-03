# v2 Spec — From Judgment Library to Delivery Engine

## Problem

v1 of this repo encodes durable engineering judgment (constitution, role agents, skills,
templates, rubrics) but none of it is *executable*. Nothing in `agents/`, `commands/`, or
`skills/` is loaded by Claude Code — the repo describes an environment rather than being one.
The rubrics anticipate a runtime (judge workers, turn logs, deterministic gates) that did not
exist when they were written. That runtime now exists natively: plugins, skills that
auto-trigger, subagents with transcripts, hooks, structured outputs, workflows, and goal loops.

v2 re-homes every rule into the mechanism that can actually hold it, without rewriting the
judgment itself.

## The Sorting Principle

Every rule in this repo lands in exactly one of three buckets:

| Bucket | Mechanism | Examples |
|---|---|---|
| Deterministic, blockable | **Hooks** (PreToolUse / PostToolUse / Stop) | file ownership globs, bcrypt ban, evidence-before-complete |
| Judgment, gradeable | **Judge gates** (rubrics + structured output) | plan concreteness, error enrichment level, verdict consistency |
| Judgment, generative | **Skills / agent prompts** (auto-triggered) | Cloudflare selection, design system, decompose-tasks |

The constitution's own rules justify the design: *policy before prompt* (hooks over reminders),
*stable failure over clever recovery* (bounded retries + STUCK state, never thrash),
*real evidence over confident narration* (judges grade artifacts AND trajectories),
*state authoritative and visible* (run state lives in `.delivery/`, not in model memory).

## End State

A Claude Code plugin (`delivery-engine`) installable into any product repo. In that repo:

```
/deliver vision.md spec.md
  → readout (planner)
  → task plan (planner) → task-plan rubric judge → bounce until PASS
  → architect review     → review-report rubric judge → bounce until PASS
  → LOOP over tasks (dependency order, authoritative state in .delivery/):
      engineer/designer subagent, boundary-enforced by hooks
      → artifact judge (+ trajectory judge over the event log)
      → FAIL: bounce with remediation, max N retries, then STUCK with diagnostics
      → PASS: next task
  → tester subagent → release-gate rubric judge (fails closed)
  → deployer → live verify → deployment report
```

Sonnet builders, stronger model for planner/architect/orchestrator, cheap judges. Orchestration
control flow is a deterministic workflow script, not model improvisation. A human can inspect,
resume, or abandon any run from `.delivery/` state alone.

## Design Decisions

- **D1 — Plugin, not scaffold.** The repo becomes plugin `delivery-engine`
  (`.claude-plugin/plugin.json` + `agents/`, `commands/`, `skills/`, `hooks/` at root — the
  current layout is already plugin-shaped). Projects install it; nothing is copy-pasted.
- **D2 — Boundaries live in one manifest.** `owned_globs`/`forbidden_globs` move from agent
  frontmatter to `policy/boundaries.json` — one machine-readable source consumed by both the
  boundary hook and the orchestrator. Agent frontmatter becomes native (name, description,
  tools, model).
- **D3 — Constitution ships as a template.** Plugins cannot inject CLAUDE.md; the constitution
  moves to `templates/constitution.md` and a `/setup-delivery` command installs/appends it into
  the target repo's CLAUDE.md.
- **D4 — Templates stay, schemas arrive.** Markdown templates remain the human-readable shape;
  `schemas/*.schema.json` become the machine contract. Pipeline artifacts are emitted as JSON
  (via structured output) and rendered to markdown for humans, which makes deterministic checks
  trivial (`release_blockers_zero` is `blockers.length === 0`).
- **D5 — Model scores, code aggregates.** Judges emit per-gate booleans and per-dimension
  scores with cited evidence; the weighted-normalized aggregation and gate caps are computed by
  a script implementing each rubric's formula. No model does arithmetic.
- **D6 — Exemplars are the judge's test suite.** A rubric is trusted only after
  `rubric-regression` passes: known-good ≥ `overall_min`, known-bad trips `gates_failed` or
  lands ≤ `overall_max`. Re-run on every rubric or judge-model change (the verification
  contract, now executable).
- **D7 — Run state is a directory.** `.delivery/` in the target repo holds `run.json` (stage,
  task statuses, retries), `boundary.json` (active role + globs for hooks),
  `events.jsonl` (trajectory surface), and `artifacts/` (JSON artifacts + judgments).
  Inspectable, resumable, rollbackable.
- **D8 — Bounded retries, explicit STUCK.** A task that fails its judge N times (default 2)
  parks as STUCK with the accumulated remediation history. The loop continues with unblocked
  tasks and surfaces STUCK items in the final report. Never silent, never infinite.

## Phases — Ordered by Difficulty × Impact

Sequenced so each phase is independently valuable and the next builds on trusted ground.

### P1 — Pluginize (difficulty: low · impact: high)

Make the existing judgment actually load.

- **Deliverables**
  - `.claude-plugin/plugin.json` manifest.
  - `skills/<name>/SKILL.md` × 17 — flat namespace, `trigger:` text merged into
    `description:` (that's what drives auto-load), `role:` moved into the body.
  - `agents/*.md` × 6 with native frontmatter; `max_turns`/globs removed
    (globs → `policy/boundaries.json`, D2).
  - `commands/*.md` × 7 referencing skills by name instead of file path.
  - `policy/boundaries.json`.
  - README rewritten for v2.
- **Acceptance**: plugin structure matches the plugin spec; every JSON file parses; every
  skill has name+description frontmatter; no command or agent references a dead path;
  installing the plugin locally surfaces the commands/agents/skills.
- **Owned surfaces**: `.claude-plugin/`, `agents/`, `commands/`, `skills/`, `policy/`, `README.md`.
- **Depends on**: none.

### P2 — Schemas + deterministic check registry (difficulty: low-medium · impact: high)

The rubrics' `check.deterministic` names become runnable code.

- **Deliverables**
  - `schemas/` — JSON Schema for: readout, task-plan, decision-log, design-spec,
    implementation-note, handoff, review-report, release-gate, deployment-report.
  - `checks/` — one Node script (no deps, `node checks/<name>.mjs <args>`) per registry
    entry: `release_blockers_zero`, `dependency_graph_acyclic`, `plan_schema_complete`,
    `tier_order`, `no_bcrypt_weak_hash`, `file_ownership`; trajectory checks over
    `events.jsonl`: `write_paths_in_boundary`, `ran_code_before_complete`,
    `harness_run_before_findings`, `release_gate_read_before_deploy`,
    `live_verify_after_deploy`, `ended_explicitly`. (`module_loads` is deferred to P5 —
    it needs the target runtime.)
  - `checks/run-all.mjs` — self-test harness with fixture artifacts proving each check
    passes good input and fails bad input.
- **Acceptance**: `node checks/run-all.mjs` exits 0 with every check exercised in both
  directions; every schema validates its template's exemplar and rejects a broken variant.
- **Owned surfaces**: `schemas/`, `checks/`.
- **Depends on**: P1 (boundaries.json exists for `file_ownership`).

### P3 — Enforcement hooks (difficulty: medium · impact: highest)

Must Not rules become physically impossible, not remembered.

- **Deliverables**
  - `hooks/hooks.json` wiring:
    - **PreToolUse [Write|Edit]** → `scripts/boundary-check.mjs`: reads
      `.delivery/boundary.json` if present; denies writes outside the active role's owned
      globs with a clear reason. No manifest → no-op (interactive use is unaffected).
    - **PreToolUse [Write|Edit]** → `scripts/crypto-guard.mjs`: denies bcrypt imports,
      MD5, unsalted-SHA-256-for-passwords patterns with the PBKDF2 policy as the reason.
    - **PostToolUse [*]** → `scripts/event-log.mjs`: appends
      `{ts, tool, paths, command, ok}` to `.delivery/events.jsonl` when a run is active —
      the trajectory surface the rubrics grade.
- **Acceptance**: with a fixture `boundary.json`, an out-of-boundary Write is denied and an
  in-boundary Write passes; a bcrypt import is denied; events accumulate in the JSONL;
  with no `.delivery/`, all hooks are inert.
- **Owned surfaces**: `hooks/`, `scripts/`.
- **Depends on**: P2 (shares check logic).

### P4 — Judge harness + exemplar regression (difficulty: medium-high · impact: high)

The rubrics start earning their keep.

- **Deliverables**
  - `agents/judge.md` — a minimal judge subagent: given rubric JSON + artifact (+ event
    log for trajectory rubrics), emits per-gate `{id, passed, evidence}` and per-dimension
    `{id, score, evidence}` via structured output. Never computes totals.
  - `scripts/aggregate.mjs` — applies weights, normalization, `applies_when` renormalization,
    and gate caps per the rubric's `aggregation` block; emits the judgment JSON.
  - `commands/judge.md` — `/judge <artifact> <rubric>`: runs deterministic gates first
    (checks from P2), then the LLM judge for the rest, then aggregation; produces a
    judgment with `remediation[]` usable as a bounce prompt.
  - `scripts/rubric-regression.md` (command or script) — runs every rubric's embedded
    known-good/known-bad through the live judge and asserts `expected`; a rubric that
    fails is marked untrusted.
- **Acceptance**: all 13 rubrics pass exemplar regression (or failures are explicitly
  reported per rubric); `/judge` on a fixture implementation-note produces a judgment whose
  deterministic gates match `checks/` output exactly.
- **Owned surfaces**: `agents/judge.md`, `commands/judge.md`, `scripts/aggregate.mjs`,
  `scripts/rubric-regression*`.
- **Depends on**: P2 (deterministic gates), P3 (event log for trajectory rubrics).

### P5 — /deliver pipeline + goal loop (difficulty: high · impact: the payoff)

- **Deliverables**
  - `workflows/deliver.js` — deterministic workflow script implementing the End State
    pipeline: stage sequencing, per-task fan-out, judge gates, bounce loop with bounded
    retries and STUCK parking, `.delivery/run.json` state transitions.
  - `commands/deliver.md` — `/deliver <vision.md> <spec.md>`: validates inputs, initializes
    `.delivery/`, invokes the workflow, reports the outcome using the deployment-report /
    release-gate shapes.
  - `commands/deliver-status.md` — render `.delivery/run.json` as a human status readout
    (resume/abandon guidance included).
  - `templates/constitution.md` + `commands/setup-delivery.md` (D3).
  - A sample `examples/` vision.md + spec.md pair small enough to run end-to-end.
- **Acceptance**: a demo run in a sandbox repo takes the sample vision+spec through plan →
  judged gates → built tasks → release gate → (mock) deploy, with at least one forced
  bounce demonstrating remediation flow and one forced STUCK demonstrating stable failure;
  `.delivery/` alone is sufficient to reconstruct what happened.
- **Owned surfaces**: `workflows/`, `commands/deliver*.md`, `commands/setup-delivery.md`,
  `templates/constitution.md`, `examples/`.
- **Depends on**: P1–P4.

### P6 — Trajectory grading in the loop (difficulty: medium · impact: medium — stretch)

Wire the six trajectory rubrics into P5 so every stage gets artifact + behavior judgment.
Deferred until the event log (P3) has proven signal quality in real runs. Not blocking v2.

## Non-Goals

- No rewriting of the judgment content itself — rubric dimensions, skill procedures, and the
  constitution's rules carry over verbatim unless a mechanism change forces a wording change.
- No single flattened autonomous prompt. The factoring IS the product.
- No external services, databases, or dashboards — `.delivery/` files and git are the state.
- No multi-repo orchestration in v2.

## Risks

- **Hook ergonomics**: boundary enforcement must never break interactive (non-run) use —
  hence the manifest-gated no-op design. Verified explicitly in P3 acceptance.
- **Judge drift**: rubric regression (D6) is the containment; runs on every rubric/judge change.
- **Workflow/runtime coupling**: P5 assumes Workflow-tool availability in the target
  environment; the command degrades to agent-driven sequencing if unavailable (documented, not
  silent).
- **Plugin spec drift**: P1 validates against the current plugin format; structure is kept
  minimal to reduce surface.
