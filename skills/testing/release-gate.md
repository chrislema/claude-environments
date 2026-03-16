# Skill: Release Gate

## Use When

- deciding whether work is ready to ship
- reviewing critical-path evidence
- preparing deployment

## Guidance

- missing evidence should fail closed on critical behavior
- known blockers should be fixed, not narrated away
- deployment should follow explicit passing state
- separate cosmetic issues from release blockers
- never skip tests to deploy faster
- write tests for bugs before fixing them

## Test Hierarchy

Tests must pass in order — each gate blocks the next:

1. **Smoke tests** (< 2 min) — critical paths work at all
2. **API tests** (2-5 min) — endpoint contracts hold
3. **E2E tests** (5-15 min) — user flows complete
4. **Full matrix** (15-30 min) — cross-browser/device (production deploys only)

## When to Run What

| Event | Smoke | E2E | API | Full Matrix |
|-------|-------|-----|-----|-------------|
| Every commit (local) | yes | no | no | no |
| Before push | yes | yes | yes | no |
| Pull request | yes | yes | yes | no |
| Pre-deployment | yes | yes | yes | yes |
| Production deploy | yes | no | no | no |

## Critical Areas

- auth and authorization
- payments and billing
- state integrity
- data safety
- deployment correctness
- error responses include rich context (usage, limits, next steps)
