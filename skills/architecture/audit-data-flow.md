---
name: audit-data-flow
description: Audits request handling pipelines for explicit data flow, visible transformations, and traceability through logs.
trigger: When designing request handling pipelines, reviewing code for debuggability, tracing production issues, or evaluating whether a new developer could follow the flow.
role: architect
---

## Purpose

Traces data through request handling pipelines to verify that every transformation is explicit and named, no hidden mutations occur, and sufficient logging exists to reconstruct what happened to any request. Flags opaque processing, action at a distance, and untraceable flows.

## Procedure

1. Identify the request handling pipelines under review. List each pipeline by entry point and final output.
2. For each pipeline, trace the data flow step by step: parse, validate, enrich, process, transform for response. Verify that each step produces a named result feeding into the next.
3. Check for hidden mutations: functions that modify their input objects as side effects instead of returning new values. Flag each instance.
4. Check for action at a distance: middleware or interceptors that silently modify request data without being obvious in the handler code. Flag each instance.
5. Check for opaque processing: calls like `await magicService.process(input)` where the transformations applied are not visible or named. Flag each instance.
6. Apply the traceability test:
   - Can someone trace this request through the logs? (Flag if no.)
   - Are transformations explicit or hidden in framework magic? (Flag if hidden.)
   - Can you explain the data flow in one sentence per step? (Flag if no.)
   - If data arrives wrong at step 4, can you tell which earlier step broke it? (Flag if no.)
7. Audit logging at key state transitions: verify that operation start (with identifiers), intermediate results (counts, amounts, status), and outcomes (success/failure, result identifiers) are logged.

## Reference

### Explicit Flow Pattern

A request handler should read as a clear sequence:
1. Parse input (explicit)
2. Validate input (explicit)
3. Enrich with context (explicit)
4. Process (explicit)
5. Transform for response (explicit)

Each step produces a named result that feeds into the next. No magic transformations inside opaque function calls.

### Logging for Traceability

Key state transitions should be logged with enough context to trace a request:
- What operation started (with identifiers)
- What intermediate results occurred (counts, amounts, status)
- What the outcome was (success/failure, result identifiers)

This is not about verbose logging — it's about logging the right things at the right granularity.

### Traceability Test

- Can someone trace this request through the logs? (should be yes)
- Are transformations explicit or hidden in framework magic? (should be explicit)
- Can you explain the data flow in one sentence per step? (should be yes)
- If data arrives wrong at step 4, can you tell which earlier step broke it? (should be yes)

### Anti-Patterns

- **Opaque processing**: `const result = await magicService.process(input)` — what happened to input? what transformations occurred?
- **Hidden mutations**: a function that modifies its input object as a side effect instead of returning a new value.
- **Action at a distance**: a middleware that silently modifies request data that handlers depend on, without being obvious in the handler code.

## Output

Produce the following:

- A step-by-step map of the data flow for each pipeline reviewed, naming each transformation.
- A list of hidden mutations, opaque processing calls, and action-at-a-distance instances with file paths and line references.
- An assessment of logging coverage: what state transitions are logged, what is missing.
- Specific recommendations for making each flagged flow explicit and traceable.
