---
name: check-release-gate
description: Evaluates whether work is ready to ship by verifying test evidence, checking for blockers, and confirming deployment readiness.
trigger: When deciding whether work is ready to ship, reviewing critical-path evidence, or preparing deployment.
role: tester, deployer
---

## Purpose

Inspects test results, critical-path evidence, and known issues to produce a ship/no-ship decision with explicit justification. Fails closed on missing evidence for critical behavior.

## Procedure

1. Identify the deployment event type (commit, push, pull request, pre-deployment, or production deploy) to determine which test gates apply.
2. Verify that the required test tiers have passed in order — each gate blocks the next. Confirm smoke tests passed before checking API tests, API tests before E2E, E2E before full matrix. Flag any tier that was skipped or run out of order.
3. Check critical areas for explicit passing evidence: auth/authorization, payments/billing, state integrity, data safety, deployment correctness, and error response quality. Missing evidence in any critical area is a blocker — do not rationalize it away.
4. Verify that error responses include rich context (usage info, limits, next steps) — not just status codes.
5. Separate findings into two categories: **release blockers** (missing evidence, failing tests, critical-area gaps) and **cosmetic issues** (style, naming, minor polish). Only blockers affect the ship decision.
6. For any known blockers, verify they have been fixed with passing evidence — not just narrated as resolved.
7. Confirm that tests for any recently fixed bugs exist and pass (write tests for bugs before fixing them).
8. Produce the release gate decision: PASS (ship) or FAIL (do not ship), with the evidence summary.

## Reference

### Test Hierarchy

Tests must pass in order — each gate blocks the next:

1. **Smoke tests** (< 2 min) — critical paths work at all.
2. **API tests** (2-5 min) — endpoint contracts hold.
3. **E2E tests** (5-15 min) — user flows complete.
4. **Full matrix** (15-30 min) — cross-browser/device (production deploys only).

### When to Run What

| Event | Smoke | API | E2E | Full Matrix |
|-------|-------|-----|-----|-------------|
| Every commit (local) | yes | no | no | no |
| Before push | yes | yes | yes | no |
| Pull request | yes | yes | yes | no |
| Pre-deployment | yes | yes | yes | yes |
| Production deploy | yes | no | no | no |

### Critical Areas

These areas fail closed — missing evidence is a blocker, not a gap to note:

- **Auth and authorization** — login, session, role enforcement.
- **Payments and billing** — charge flows, plan changes, invoicing.
- **State integrity** — data consistency across operations.
- **Data safety** — backups, deletion protection, PII handling.
- **Deployment correctness** — migrations, config, rollback capability.
- **Error responses** — must include rich context: usage info, limits, next steps.

### Rules

- Missing evidence fails closed on critical behavior — do not assume passing.
- Known blockers must be fixed, not narrated away.
- Deployment follows explicit passing state, not optimism.
- Never skip tests to deploy faster.
- Write tests for bugs before fixing them.
- Cosmetic issues do not block releases — track them separately.

## Output

Produce a **Release Gate Report** containing:

- **Decision**: PASS or FAIL
- **Event type**: The deployment stage being evaluated
- **Test tiers**: Status of each tier (passed / failed / skipped / not required)
- **Critical areas**: Evidence status for each critical area (verified / missing / not applicable)
- **Blockers**: List of release blockers with specific details (if any)
- **Cosmetic issues**: List of non-blocking issues to track separately (if any)
- **Summary**: One or two sentences justifying the decision
