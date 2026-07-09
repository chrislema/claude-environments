# Run Journal

The engine's memory of its own evolution (D20). Every end-to-end `/deliver` run gets a
**pre-entry** (what forward-progress question is this run answering?) and a **post-entry**
(what did we learn, and what is the cheapest next proof?). mastra's most expensive bugs were
fixed one paid run at a time until someone wrote rules against exactly that — this journal is
that rule's artifact.

## Template

```
### Run <run_id> — <YYYY-MM-DD>
Pre — forward-progress question: <what should this run move past? what is the cheapest proof
      that would tell us it worked?>
Post:
  - Farthest verified stage: <readout|plan|review|scaffold|build:Tn|test|deploy>
  - Failure class (if any): <no_writes|boundary_blocked|verification_failed|judge_rejected|infra_failure|none>
  - Cheapest next proof: <the fixture/self-test that proves the fix statically, or the next paid run>
  - Rule re-sorted (if the fix was "more prompt pressure"): <which rule moved to which bucket, or none>
```

## Rules (see CLAUDE.md → Maintaining the engine)

- **Cheap-proof-first:** before re-running the pipeline to test a fix, write the fixture or
  self-test that proves it statically, if one is possible.
- **Forward-progress scoreboard:** a fix that moves the failure earlier without moving delivery
  farther is not progress — record both, not just the first.
- **Re-sort stop condition:** when the tempting fix is "more prompt pressure," stop and re-sort
  the rule into a better bucket — a hook/check (deterministic), a rubric gate/dimension
  (judgment), or a skill (generative).

---

## Entries

<!-- newest first -->
