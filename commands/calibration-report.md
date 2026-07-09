---
description: Report per-trajectory-rubric advisory separation across archived runs, and whether each has earned promotion from advisory to gating (D18).
argument-hint: []
---

Report the calibration of the advisory trajectory rubrics.

Procedure:

1. Run `node <plugin>/scripts/calibration.mjs` from the target repo. It reads
   `.delivery/history/*.json` — the runs archived when each `/deliver` run finishes.

2. It prints, per trajectory rubric, the mean advisory score on stages whose artifact
   judgment PASSED versus stages that BOUNCED or parked, their separation, and whether the
   D18 promotion criterion is met (≥10 runs and a passed−failed separation ≥ 0.15).

3. A rubric marked `PROMOTE to gating` has earned teeth: set its `activation.gating` to
   `true` and `activation.mode` to `gating` in `rubrics/trajectory/<name>.rubric.json`, then
   re-run `/rubric-regression` before relying on it to bounce work. Never promote a rubric the
   report does not mark PROMOTE — advisory-until-proven is the whole point.

4. Report the table verbatim and name any rubric that has crossed the threshold. If there are
   fewer than 2 archived runs, say so and stop — calibration needs history to mean anything.
