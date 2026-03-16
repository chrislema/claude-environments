# Skill: Traceability Audit

## Use When

- reviewing implementation completeness
- validating frontend-to-backend wiring
- checking route, handler, middleware, or storage consistency

## Guidance

- trace real flows across UI, handlers, middleware, and storage
- focus on broken wiring, dead paths, and naming drift
- look for duplicate route ownership or inconsistent binding names
- produce findings that map to specific remediation tasks
- test the contract, not the implementation

## Coverage Requirements

For each feature, verify these scenarios exist:
- Happy path (success flow)
- Validation errors (invalid input)
- Authentication errors (401)
- Authorization errors (403)
- Usage limit errors (429 with rich context — usage, limit, reset date)
- Server errors (500)
- Loading states and empty states

## Selector Strategy

When reviewing test quality, check selector priority:
1. Role-based (`getByRole`) — most resilient
2. Label-based (`getByLabel`) — accessible
3. Text-based (`getByText`) — readable
4. Test ID (`getByTestId`) — fallback only

Flag CSS selectors (`#id`, `.class`) as brittle.

## Test Quality Checks

- No arbitrary waits (`waitForTimeout`) — wait for specific conditions
- Test names follow: `[action] [expected result] [condition]`
- Error response tests verify rich context fields (not just status codes)
- Tests are independent — no shared mutable state between tests

## Review Focus

- missing handler implementations
- duplicate route or middleware ownership
- storage binding mismatches
- naming drift across related layers
- test coverage gaps against the requirements list
- brittle selectors or arbitrary waits in existing tests
