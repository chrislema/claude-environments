# Event Vocabulary — `.delivery/events.jsonl`

The trajectory surface. One JSON object per line. Written by the enforcement hooks (P3)
and the /deliver orchestrator (P5); read by the trajectory checks in `checks/` and the
trajectory rubric judges.

Every event carries:

- `ts` — ISO 8601 timestamp
- `source` — `"hook"` or `"orchestrator"`
- `type` — one of the types below

## Hook-emitted events

| type | fields | meaning |
|---|---|---|
| `tool_use` | `tool`, `paths[]?`, `command?`, `ok` | Any tool call observed by the PostToolUse hook. `paths` for Write/Edit; `command` for Bash. |

## Orchestrator-emitted events

| type | fields | meaning |
|---|---|---|
| `stage_start` | `stage`, `role` | A pipeline stage began (e.g. `"build:T2"`, role `"engineer"`). |
| `stage_end` | `stage`, `reason` | Stage ended. `reason`: `complete_stage`, `escalation`, or `max_turns`. |
| `artifact_write` | `artifact_type`, `path` | A pipeline artifact was produced (types match `schemas/`). |
| `artifact_read` | `artifact_type`, `path` | A pipeline artifact was read. |
| `run_code` | `ref`, `ok` | A test/harness/verification execution. |
| `det_results` | `gate_set`, `out`, `failed[]` | A deterministic gate-set executed. `out` is the det-results file it wrote; `failed` lists the ids of gates that did not pass. Emitted by `checks/run.mjs gate-set --register` via `stage.mjs` — the check writes and registers its own result, so no model transcribes it (T2). |
| `deploy` | `target`, `revision` | A deployment was executed. |
| `migration_applied` | `name` | A D1 migration was applied to an environment (D19). |
| `prior_version` | `version_id` | The version id captured BEFORE a production promote — the recorded rollback target (D19). |
| `version_upload` | `version_id`, `preview_url` | A `wrangler versions upload` produced a preview receiving no traffic (D19). |
| `approval` | `approver`, `decision` | A recorded human approval for a production promote (D19). |
| `version_promote` | `version_id`, `percentage` | A `wrangler versions deploy` promoted a version (gradual by default) (D19). |
| `live_verify` | `target`, `ok` | A direct probe against the deployed target. |
| `escalate` | `question`, `why_blocking` | A blocking question was raised to the user. |

## Stage slicing

Trajectory checks evaluate the slice of events between a `stage_start` and its matching
`stage_end` (matched by `stage`). With no stage argument, they evaluate the whole log.

## Conventions

- Writes under `.delivery/**` are artifact bookkeeping, exempt from boundary checks.
- A `tool_use` with `tool: "Bash"` counts as code execution for `ran_code_before_complete`
  and `harness_run_before_findings` — the orchestrator's `run_code` events are the
  preferred, explicit signal.
- Events are append-only. Nothing rewrites history; corrections are new events.
