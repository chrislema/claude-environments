---
description: Promote a real run's judged artifact (plus the human verdict) into the owning rubric's exemplars, then require /rubric-regression — the calibration set compounds with use instead of staying frozen at authoring time (D20).
argument-hint: [judgment-file] [known_good|known_bad]
---

Promote a judged artifact from a real run into a rubric's exemplars.

Procedure:

1. Read the judgment file at `$1` (a `.delivery/artifacts/judgments/*.judgment.json`). It names
   the `rubric` and the subject it scored. Read the subject artifact it judged.

2. **Confirm the human verdict.** Ask the user whether this is a genuine `known_good` or
   `known_bad` (`$2`). Do not promote on the machine judgment alone — the point is to teach the
   rubric from a human-confirmed example.

3. Append an exemplar to `rubrics/<rubric>.rubric.json` (or `rubrics/trajectory/<rubric>.rubric.json`)
   under `exemplars.$2`:
   - `summary`: one line.
   - `content`: a faithful, trimmed rendering of the subject artifact.
   - `expected`: `{gates_failed: [...], overall_min}` for known_good, or
     `{gates_failed: [...], overall_max}` for known_bad — matching the human verdict.

4. Run `/rubric-regression <rubric>`. If it is not `TRUSTED`, the new exemplar broke the
   separation the rubric depends on — revise the exemplar or revert. **Never merge an untrusted
   rubric** (Maintaining the engine invariant).

5. Report what was added and the regression result verbatim.
