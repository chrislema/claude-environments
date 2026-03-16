# Skill: Data Flow Transparency

## Use When

- designing request handling pipelines
- reviewing code for debuggability
- tracing production issues
- evaluating whether a new developer could follow the flow

## Guidance

- data flow should be visible and explicit
- no hidden mutations or action at a distance
- each transformation step should be obvious
- tracing a request through the system should be possible without deep knowledge

## Explicit Flow Pattern

A request handler should read as a clear sequence:
1. Parse input (explicit)
2. Validate input (explicit)
3. Enrich with context (explicit)
4. Process (explicit)
5. Transform for response (explicit)

Each step produces a named result that feeds into the next. No magic transformations inside opaque function calls.

## Logging for Traceability

Key state transitions should be logged with enough context to trace a request:
- What operation started (with identifiers)
- What intermediate results occurred (counts, amounts, status)
- What the outcome was (success/failure, result identifiers)

This is not about verbose logging — it's about logging the right things at the right granularity.

## Decision Framework

- Can someone trace this request through the logs? (should be yes)
- Are transformations explicit or hidden in framework magic? (should be explicit)
- Can you explain the data flow in one sentence per step? (should be yes)
- If data arrives wrong at step 4, can you tell which earlier step broke it? (should be yes)

## Anti-Patterns

- **Opaque processing**: `const result = await magicService.process(input)` — what happened to input? what transformations occurred?
- **Hidden mutations**: a function that modifies its input object as a side effect instead of returning a new value
- **Action at a distance**: a middleware that silently modifies request data that handlers depend on, without being obvious in the handler code

## Output Expectations

- verify data flow is explicit and readable
- identify hidden transformations or mutations
- check that key state transitions are logged
- flag opaque processing that would be hard to debug at 2 AM
