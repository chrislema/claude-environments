---
description: Render the current delivery run's state — stage, task statuses, judgments, stuck items — from .delivery/ alone.
argument-hint: []
---

Report the state of the delivery run in the current repo.

Procedure:

1. Run `node <plugin>/scripts/stage.mjs status` from the repo root. If it reports no
   active run, say so and stop.

2. Read `.delivery/run.json` and present:
   - run id, status, current stage, started/finished timestamps
   - task table: id, status, retries, owner, note (stuck tasks first)
   - judgments: subject, rubric, overall score, passed
   - artifacts produced (with paths)

3. Read the last ~20 lines of `.delivery/events.jsonl` and summarize recent activity in
   one or two sentences.

4. End with the applicable next action:
   - `running` → what stage is in flight and how to resume if it was interrupted
     (Workflow resumeFromRunId).
   - `stuck` → the stuck tasks' remediation notes and the fix-and-rerun path.
   - `failed` → the gate blockers.
   - `complete` → nothing pending; point at the deployment report.

Never infer state from memory — `.delivery/` is authoritative.
