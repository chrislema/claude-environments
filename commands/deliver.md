---
description: Run the full judged delivery pipeline from a vision.md and spec.md — plan, review, build loop with bounded bounces, release gate, deploy — autonomously.
argument-hint: [vision.md] [spec.md]
---

Deliver the product described by the given vision and spec files.

Procedure:

1. **Validate inputs.** Both files must exist in the target repo. The repo must be a git
   repository with a clean-enough working tree (uncommitted changes are allowed but note
   them). Refuse to start if `.delivery/run.json` shows a run with status `running` —
   surface it and ask whether to abandon or resume.

2. **Initialize run state:**
   `node <plugin>/scripts/stage.mjs init --vision=<vision> --spec=<spec>` (from the repo root).

3. **Invoke the pipeline** with the Workflow tool:
   `Workflow({ scriptPath: "<plugin>/workflows/deliver.js", args: { repo: "<repo abs path>", plugin: "<plugin abs path>", vision: "<vision>", spec: "<spec>", deployMode: "local" } })`
   Optional args: `maxRetries` (default 2), `judgeModel` (default haiku),
   `deployMode: "staging" | "production"` only when the user explicitly asked for a real
   deployment (production requires Cloudflare credentials and a recorded human approval).
   If the Workflow tool is unavailable, run the same sequence yourself with Agent calls,
   following workflows/deliver.js as the authoritative order — do not improvise a
   different pipeline.

4. **Report the outcome** from the workflow's return value plus `.delivery/run.json`:
   - `blocked_on_questions` → present the blocking ambiguities to the user; the run is
     parked, not failed.
   - `stuck` / `gate_failed` → present the remediation history and blockers exactly as
     recorded. Known blockers are fixed, not rationalized away — offer next actions
     (fix and re-run, or abandon).
   - `complete` → summarize tasks, judgments (scores per stage), gate decision, and the
     deployment report. Include stuck/blocked tasks prominently if any.

5. **Resume**: a killed or interrupted run can be resumed with
   `Workflow({ scriptPath: ..., args: <same args>, resumeFromRunId: "<wf id>" })` — completed
   stages return cached. `.delivery/` remains the authoritative record either way.
