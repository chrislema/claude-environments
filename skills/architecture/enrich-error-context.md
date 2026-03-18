---
name: enrich-error-context
description: Evaluates error responses for actionable context and verifies that user-facing errors guide next steps while service-layer errors remain technical and reusable.
trigger: When designing error responses, reviewing API output quality, building user-facing error handling, or evaluating support burden from poor error messages.
role: architect, engineer
---

## Purpose

Audits error responses across the system to ensure user-facing errors are actionable (not just descriptive), service-layer errors return technical data (not UX copy), and the right context reaches the right audience. Flags useless, generic, or misplaced error messages.

## Procedure

1. Inventory all error responses in the surface under review: API error responses, UI error displays, webhook failure responses, background job failure records.
2. Classify each error response against the enrichment levels. Flag anything below Level 3 for user-facing errors and anything below Level 2 for developer-facing errors.
3. For each user-facing error, verify it includes: what happened, current state (counts, limits, timestamps), and what the user can do next (specific actions, links, or instructions).
4. For each service-layer error, verify it returns technical data (error codes, state data, identifiers) and does NOT embed UX copy, branded messaging, or application-specific instructions.
5. Check audience routing: user-facing contexts get actionable messages, developer contexts get stack traces and request IDs, operations contexts get system state and timestamps.
6. Flag raw technical errors surfaced to users: stack traces, SQL errors, internal codes without translation.
7. Verify that error translation happens at the application edge — services return technical results, applications translate to user terms.

## Reference

### Error Enrichment Levels

1. **Useless**: `{ "error": "Invalid request" }` — tells nothing.
2. **Basic**: `{ "error": "Usage limit exceeded" }` — names the problem.
3. **Helpful**: includes current usage, limit, and reset date — explains the situation.
4. **Actionable**: includes all of the above plus specific actions (upgrade URL, wait for reset, contact support) — tells the user what to do.

Always aim for Level 4 on user-facing errors.

### Audience-Specific Context

- **User-facing error**: What can they do about it? (upgrade, retry, fix input)
- **Developer error**: What code caused this? (stack trace, request ID, component)
- **Operations error**: What system state led to this? (queue depth, service status, timestamps)

### Service vs. Application Responsibility

- Services return technical results (error codes, state data).
- Applications translate to user terms (helpful messages, action links).
- Services are reusable — don't embed UX copy in them.
- Applications own the experience — add context at the edge.

### Anti-Patterns

- **Useless errors**: `throw new Error("Invalid input")` — what input? what's invalid?
- **Service-owned UX**: `"Payment failed. Please contact support at support@example.com"` in a reusable service — tightly coupled to one application.
- **Raw technical errors surfaced to users**: stack traces, SQL errors, or internal codes without translation.

## Output

Produce the following:

- A list of error responses with their current enrichment level and target level.
- Specific recommendations for each error that needs enrichment: what context to add, what actions to include.
- Any service-layer errors that contain UX copy and should be made technical.
- Any user-facing paths where raw technical errors leak through without translation.
