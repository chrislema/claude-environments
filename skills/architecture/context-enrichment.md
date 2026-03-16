# Skill: Context Enrichment

## Use When

- designing error responses
- reviewing API output quality
- building user-facing error handling
- evaluating support burden from poor error messages

## Guidance

- errors are user interface — they should tell users what to do next
- don't just return error codes or generic messages
- include current state, limits, and actionable next steps
- different audiences need different context

## Error Enrichment Levels

1. **Useless**: `{ "error": "Invalid request" }` — tells nothing
2. **Basic**: `{ "error": "Usage limit exceeded" }` — names the problem
3. **Helpful**: includes current usage, limit, and reset date — explains the situation
4. **Actionable**: includes all of the above plus specific actions (upgrade URL, wait for reset, contact support) — tells the user what to do

Always aim for Level 4 on user-facing errors.

## Audience-Specific Context

- **User-facing error**: What can they do about it? (upgrade, retry, fix input)
- **Developer error**: What code caused this? (stack trace, request ID, component)
- **Operations error**: What system state led to this? (queue depth, service status, timestamps)

## Decision Framework

- Services return technical results (error codes, state data)
- Applications translate to user terms (helpful messages, action links)
- Services are reusable — don't embed UX copy in them
- Applications own the experience — add context at the edge

## Anti-Patterns

- **Useless errors**: `throw new Error("Invalid input")` — what input? what's invalid?
- **Service-owned UX**: `"Payment failed. Please contact support at support@example.com"` in a reusable service — tightly coupled to one application
- **Raw technical errors surfaced to users**: stack traces, SQL errors, or internal codes without translation

## Output Expectations

- identify where error context should be enriched
- verify user-facing errors include actionable next steps
- check that services return technical data, not UX copy
- flag useless or generic error messages
