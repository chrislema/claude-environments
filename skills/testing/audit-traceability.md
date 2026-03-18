---
name: audit-traceability
description: Traces feature implementation from UI through handlers, middleware, and storage to identify broken wiring, dead paths, and coverage gaps.
trigger: When reviewing implementation completeness, validating frontend-to-backend wiring, or checking route/handler/middleware/storage consistency.
role: tester
---

## Purpose

Traces real flows across UI, handlers, middleware, and storage layers to identify broken wiring, dead paths, naming drift, and test coverage gaps. Produces findings mapped to specific remediation tasks.

## Procedure

1. Identify the feature or surface to audit. Collect the relevant routes, handlers, middleware, and storage bindings.
2. Trace each route from the UI trigger through to storage and back. For each route, verify:
   - The UI element is bound to the correct route/endpoint.
   - The handler exists and is wired to the route.
   - Required middleware is attached and ordered correctly.
   - Storage bindings (database, KV, etc.) match the names used in the handler.
   - The response flows back to the UI correctly.
3. Check for naming drift: verify that binding names, route paths, handler function names, and UI references use consistent naming across all layers. Flag any mismatches.
4. Check for duplicate route ownership — two handlers claiming the same route or method. Flag conflicts.
5. Verify test coverage against the required scenario list (see Reference). For each feature, confirm tests exist for: happy path, validation errors, auth errors (401), authorization errors (403), usage limit errors (429 with rich context), server errors (500), loading states, and empty states. Flag missing scenarios.
6. Evaluate test quality: check selector strategy, wait patterns, test naming, error context verification, and test independence (see Reference). Flag violations.
7. Identify dead paths — routes with no UI trigger, handlers with no route, storage bindings with no reader/writer. Flag as cleanup candidates or missing wiring.
8. Map every finding to a specific remediation task: what to fix, where, and how to verify the fix.

## Reference

### Coverage Requirements

For each feature, verify these test scenarios exist:

| Scenario | What to verify |
|----------|---------------|
| Happy path | Success flow completes end-to-end |
| Validation errors | Invalid input is rejected with clear messages |
| Authentication errors (401) | Unauthenticated requests are blocked |
| Authorization errors (403) | Unauthorized role/scope is denied |
| Usage limit errors (429) | Rich context returned: usage, limit, reset date |
| Server errors (500) | Graceful failure with useful error response |
| Loading states | UI shows loading indicator during async operations |
| Empty states | UI handles zero-result cases meaningfully |

### Selector Strategy

When reviewing test quality, check selector priority (most resilient to least):

1. **Role-based** (`getByRole`) — most resilient to markup changes.
2. **Label-based** (`getByLabel`) — accessible and stable.
3. **Text-based** (`getByText`) — readable but fragile to copy changes.
4. **Test ID** (`getByTestId`) — fallback only when above options are insufficient.

Flag CSS selectors (`#id`, `.class`) as brittle — they break on routine refactors.

### Test Quality Checks

- **No arbitrary waits**: Flag `waitForTimeout` or `sleep` calls. Tests must wait for specific conditions (element visible, network idle, state change).
- **Test naming convention**: `[action] [expected result] [condition]` — e.g., "submits form shows success message when all fields valid."
- **Error response verification**: Tests must check rich context fields (usage, limits, next steps), not just status codes.
- **Test independence**: No shared mutable state between tests. Each test sets up and tears down its own context.

### Tracing Checklist

When tracing a flow, check each layer:

- [ ] UI element exists and triggers the correct route
- [ ] Route is registered and points to the correct handler
- [ ] Handler implementation exists (not a stub or placeholder)
- [ ] Required middleware is attached in correct order
- [ ] Storage binding names match across handler and config
- [ ] Response format matches what the UI expects
- [ ] Error paths are handled at each layer (not just happy path)
- [ ] No duplicate route ownership or conflicting handlers
- [ ] Naming is consistent across all layers (no drift)

### Anti-patterns to Flag

- Routes with no corresponding UI trigger (dead routes).
- Handlers that reference storage bindings by wrong name.
- Middleware attached to wrong routes or in wrong order.
- Tests using CSS selectors instead of role/label/text selectors.
- Tests with `waitForTimeout` instead of condition-based waits.
- Tests that depend on execution order or shared mutable state.
- Error tests that only check status codes without verifying context fields.

## Output

Produce an **Audit Report** containing:

- **Scope**: Feature or surface audited.
- **Flows traced**: List of routes/flows examined with pass/fail status for each layer.
- **Wiring issues**: List of broken connections, naming drift, duplicate ownership, or dead paths — each with file locations and specific details.
- **Coverage gaps**: Missing test scenarios per feature, organized by the coverage requirements list.
- **Test quality issues**: Brittle selectors, arbitrary waits, naming violations, independence problems — each with file and line reference.
- **Remediation tasks**: Ordered list of specific fixes, each naming the file/location, what to change, and how to verify the fix.
