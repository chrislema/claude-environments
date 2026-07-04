---
description: Score a pipeline artifact or trajectory log against a rubric; deterministic gates run as code, the judge agent scores the rest, aggregation is computed not narrated.
argument-hint: [artifact-or-events-path] [rubric-name]
---

Judge the given subject against the given rubric.

Procedure:

1. Load `rubrics/<rubric-name>.rubric.json` (or `rubrics/trajectory/<name>.rubric.json`
   for role trajectories). Identify the subject: an artifact JSON, or an events JSONL
   slice for trajectory rubrics.

2. **Deterministic gates first.** For every gate whose `check` is
   `{"deterministic": "<name>"}`, run `node checks/run.mjs <name> <args>` and collect the
   JSON results into a temp file (an array of `{id, passed, reason}`, using the gate's id).
   Do not ask a model to evaluate these.

3. **LLM gates and dimensions.** Spawn the `judge` agent (small/fast model) with:
   - the rubric's LLM gates (`check: "llm"`) and all dimensions,
   - the subject content,
   - any `needs_surface` materials that exist (skip gracefully — the judge marks
     `not_scored` for what is missing).
   The judge returns strict JSON. If its output fails to parse, re-spawn once; a second
   failure is a judge malfunction — report it, do not improvise scores.

4. **Aggregate in code.**
   `node scripts/aggregate.mjs <rubric> <judge-output> --deterministic=<results> [--threshold=0.7]`

5. Report the judgment: overall score, gates failed, weak dimensions, and the
   `remediation` list verbatim — remediation entries are designed to be usable directly
   as bounce instructions to the producing role.

6. If a delivery run is active (`.delivery/` exists), save the judgment to
   `.delivery/artifacts/judgments/<subject>-<rubric>.json` and log an `artifact_write`
   event.
