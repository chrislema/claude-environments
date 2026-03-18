---
name: audit-state-boundaries
description: Audits stateful logic and error handling to verify single sources of truth, boundary-layer error handling, and explicit recovery paths.
trigger: When designing APIs or workflows, refactoring stateful logic, or reviewing retries, fallback behavior, or recovery flows.
role: architect
---

## Purpose

Examines stateful systems and error handling architecture to ensure every piece of state has one authoritative owner, errors are handled at boundaries rather than scattered through business logic, and recovery paths exist for every failure scenario.

## Procedure

1. Identify all state-bearing surfaces in the system under review: databases, caches, session stores, application memory, local variables, queues.
2. For each important piece of state, determine the authoritative owner. Apply the state integrity test:
   - Can multiple services arrive at different conclusions about this state? (Flag if yes.)
   - If a service crashes, is this state lost? (Flag if yes.)
   - Can you query "what is the state of all pending items?" (Flag if no.)
3. Verify that caches and derived stores are treated as optimization, not truth. Check that invalidation happens on writes, not on reads.
4. Map the error handling architecture. Verify it follows the boundary pattern: business logic throws, boundary layers catch and handle, recovery is a separate concern.
5. Check for scattered try-catch blocks in business logic. Flag nested try-catch, catch-and-forget (`catch (error) { console.error(error); }`), and silent degradation (`catch (error) { return fallbackValue; }`).
6. Verify fail-fast behavior: invalid state returns errors immediately, limits are not silently degraded, unclear situations are marked as "stuck" rather than guessed at.
7. Audit recovery design: confirm explicit stuck/failed states exist in state machines, retry counts and last errors are tracked, and recovery strategies are defined per failure type.

## Reference

### State Management Principles

- Database is canonical — everything else is derived.
- No authoritative state in application memory, caches, or local variables.
- If unsure about state, query the source.
- Caches are optimization, not truth — invalidate on writes, not on reads.

### Error Handling Architecture

Business logic throws — it does not catch. Boundaries catch and handle. Recovery is a separate concern.

```
Business Logic Layer
    | (throws errors)
Boundary Layer (API handler, proxy)
    | (catches, logs, enriches)
Recovery Layer (cron, retry workers)
    | (handles permanent failures)
```

Do not scatter try-catch throughout business logic. Do not nest try-catch blocks.

### Fail-Fast Rules

- Invalid state: return error immediately.
- Limits exceeded: do not silently degrade.
- Unclear situation: mark as "stuck" rather than guess.
- Recovery is a separate process, not an inline fallback.

### Recovery Strategies by Failure Type

- Transient network error: automatic retry with backoff.
- Invalid input: mark failed, alert for review.
- External service down: queue for retry when service recovers.
- Data corruption: rollback transaction, alert operations.
- Logic bug: mark stuck, fix code, replay.

### Anti-Patterns

- **Scattered state**: order status in session, cache, and database — which is authoritative?
- **Silent degradation**: `catch (error) { return fallbackValue; }` — user never knows something failed.
- **Missing recovery**: `catch (error) { console.error(error); }` — log and forget.
- **Nested try-catch**: business logic wrapped in 3 levels of catch blocks.

## Output

Produce the following:

- The authoritative state owner for each important piece of state, with flags for any duplicated or ambiguous ownership.
- A map of where boundary error handling occurs and where it is missing.
- A list of any hidden, duplicated, or scattered state.
- Verification that recovery paths exist for each failure scenario, or explicit gaps where they are missing.
