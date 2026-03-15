# Skill: API Middleware Enforcement

## Use When

- building request middleware
- enforcing plans or feature access
- attaching request context

## Guidance

- keep business handlers thin
- perform verification and enforcement early
- attach useful entitlement or usage context when it helps downstream handlers
- return clear, fast-failing responses for denied access
- avoid putting deep domain logic into middleware

## Review Focus

- auth and entitlement checks
- request context shape
- denial behavior
- duplication between middleware and handlers
