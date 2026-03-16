# Skill: State And Error Boundaries

## Use When

- designing APIs or workflows
- refactoring stateful logic
- reviewing retries, fallback behavior, or recovery flows

## Guidance

- keep one clear source of truth for each important piece of state
- handle errors at boundaries instead of scattering rescue logic through business code
- prefer stable failed states and explicit repair paths over hidden recovery chains
- make lifecycle transitions visible and inspectable

## State Management

- Database is canonical — everything else is derived
- No authoritative state in application memory, caches, or local variables
- If unsure about state, query the source
- Caches are optimization, not truth — invalidate on writes, not on reads

Test with these questions:
- Can multiple services arrive at different conclusions about state? (should be no)
- If your service crashes, is state lost? (should be no)
- Can you query "what is the state of all pending jobs?" (should be yes)

## Error Handling Architecture

Business logic throws — it does not catch. Boundaries catch and handle. Recovery is a separate concern.

```
Business Logic Layer
    ↓ (throws errors)
Boundary Layer (API handler, proxy)
    ↓ (catches, logs, enriches)
Recovery Layer (cron, retry workers)
    ↓ (handles permanent failures)
```

Do not scatter try-catch throughout business logic. Do not nest try-catch blocks.

## Fail Fast

- Invalid state → return error immediately
- Limits exceeded → do not silently degrade
- Unclear situation → mark as "stuck" rather than guess
- Recovery is a separate process, not an inline fallback

## Recovery By Design

Design for failure during design, not after production incidents:

- Every operation can fail — plan for it
- Include explicit stuck/failed states in all state machines
- Track retry counts and last error
- Recovery workers run on schedule, pick up stuck items
- Recovery strategies by failure type:
  - Transient network error → automatic retry with backoff
  - Invalid input → mark failed, alert for review
  - External service down → queue for retry when service recovers
  - Data corruption → rollback transaction, alert operations
  - Logic bug → mark stuck, fix code, replay

## Anti-Patterns

- **Scattered state**: order status in session, cache, and database — which is authoritative?
- **Silent degradation**: `catch (error) { return fallbackValue; }` — user never knows something failed
- **Missing recovery**: `catch (error) { console.error(error); }` — log and forget
- **Nested try-catch**: business logic wrapped in 3 levels of catch blocks

## Output Expectations

- identify the authoritative state owner
- identify where boundary error handling should happen
- call out any hidden or duplicated state
- verify recovery paths exist for failure scenarios
