---
description: Run every rubric's embedded known-good/known-bad exemplars through the live judge and verify the expected outcomes — the verification contract that decides whether a rubric is trusted.
argument-hint: [rubric-name (optional — default all)]
---

Run exemplar regression for the requested rubrics (default: all 13 — 7 artifact rubrics
in `rubrics/`, 6 trajectory rubrics in `rubrics/trajectory/`).

Procedure:

1. Generate the judge prompts into a scratch working directory:
   `node scripts/regression-prompts.mjs <workdir> [rubric-name]`
   This writes one prompt per exemplar plus `manifest.json`.

2. For each prompt in the manifest, spawn the `judge` agent (small/fast model) in
   parallel batches. Each judge reads its prompt file and writes its raw JSON output to
   the manifest's `output` path. The prompts are self-contained **regression mode**
   instructions: the judge evaluates ALL gates (including normally-deterministic ones)
   from what the exemplar text describes.

3. When all judges have finished, evaluate:
   `node scripts/regression-evaluate.mjs <workdir>`
   This aggregates every output (scripts/aggregate.mjs), runs the verification contract
   (scripts/check-exemplars.mjs), and prints the TRUSTED/UNTRUSTED table. Exit 0 means
   every rubric is trusted.

6. Any UNTRUSTED rubric is a release blocker for judge-gated pipelines: either the rubric's
   anchors/exemplars need revision or the judge model is inadequate. Report which side the
   evidence points to — do not silently proceed.

Re-run this whenever a rubric changes or the judge model changes.
