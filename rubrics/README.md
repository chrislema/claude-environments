# Rubrics

Machine-readable evaluation rubrics for every artifact type and every role trajectory in this
environment. Authored 2026-06-09 via feedback-loop Phase 1 (Claude, at design time — the
deliberate exception to runtime model residency; see the delivery-engine spec §7). Applied at
runtime by compiled judge workers on resident models.

## Format

Base format is the feedback-loop skill's machine-readable rubric JSON
(`scale`, `gates`, `dimensions` with 1/3/5 anchors, floor-subtracted `aggregation`), plus these
extensions:

| Field | On | Meaning |
|---|---|---|
| `gates[].check` | gate | `"llm"` or `{"deterministic": "<check_name>"}` — deterministic gates run as code in the host, before any model scoring. |
| `dimensions[].model` | dimension | `"default"` (resident judge model) or `"claude"` (routes to claude-haiku via gateway; used sparingly for genuinely nuanced dimensions). |
| `dimensions[].surface` | dimension | `"artifact"`, `"trajectory"` (the stage's turns rows), or `"evidence"` (the evidence table). |
| `dimensions[].needs_surface` | dimension | Named secondary surface required to score (e.g. `"task_plan"`). Absent surface → `not_scored`, renormalize — never guess. |
| `applies_when` | gate/dimension | Conditional scope (e.g. crypto gate applies only when auth code is present). Out of scope → gate passes vacuously / dimension `not_scored`. |
| `weight_rationale` | rubric | Why the heaviest dimension is heaviest (feedback-loop step 6). |
| `unmeasurable_rules` | rubric | Source rules this rubric cannot observe, with the rubric/surface that IS their home — flagged, never dropped (feedback-loop step 5). |
| `exemplars` | rubric | Embedded known-good/known-bad pair with expected outcomes — the discrimination check (feedback-loop step 8) and the judge's regression test. |

## Verification contract

A rubric may not go `active` until its compiled judge separates the embedded exemplars
(known-good ≥ its `expected.overall_min`, known-bad trips its `expected.gates_failed` or lands
≤ its `expected.overall_max`). Exemplars re-run on every rubric revision and every judge-model
change.

## Deterministic check registry (referenced by `gates[].check.deterministic`)

Artifact checks: `file_ownership`, `module_loads`, `no_bcrypt_weak_hash`, `tier_order`,
`release_blockers_zero`, `dependency_graph_acyclic`, `plan_schema_complete`.
Trajectory checks: `write_paths_in_boundary`, `ran_code_before_complete`,
`no_code_artifacts_written`, `harness_run_before_findings`, `release_gate_read_before_deploy`,
`live_verify_after_deploy`, `ended_explicitly`.

## Independence note

These rubrics were authored by Claude. Grading one's own criteria is not an independent check —
which is exactly why, at runtime, the judges that apply them are different models running in
network-isolated workers, and why every rubric is human-reviewed before activation. The
exemplar pairs exist so that review has something concrete to disagree with.

## Files

- `*.rubric.json` — 7 artifact rubrics (graded at stage boundaries)
- `trajectory/*.rubric.json` — 6 role trajectory rubrics (graded over the stage's turn log)
