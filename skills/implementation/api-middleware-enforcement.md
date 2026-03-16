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

## Layered Middleware Architecture

Middleware should be layered with clear responsibilities at each level:

**Root middleware** (`functions/_middleware.js`):
- Check for session cookie or Authorization header
- Verify session with auth system
- Attach user/company/plan data to request context
- Redirect unauthenticated users to login
- Allow public paths (landing, login, signup, static assets)

**API middleware** (`functions/api/_middleware.js`):
- Verify authentication (user must exist from root middleware)
- Check subscription status (active, past_due, canceled)
- Calculate current usage from database
- Enforce plan limits (prevent requests if limit exceeded)
- Check feature access based on plan
- Attach usage stats and limits to context

**Why layered:**
- Separation of concerns: auth vs authorization vs usage
- Performance: only check usage for API calls, not page views
- Each layer has single responsibility
- Can add/remove layers without affecting others

## Context Shape

Middleware populates `context.data` for downstream handlers:

```
context.data = {
  user: { id, email, role, ... },
  company: { id, name, subscriptionStatus, ... },
  plan: { name, maxUsers, features, ... },
  usage: { current, limit, remaining },
  sessionToken: "..."
}
```

This data flows to all downstream functions without additional auth checks.

## Denial Patterns

Fail fast with actionable responses:
- Inactive subscription → 403 with status and renewal URL
- Usage limit exceeded → 429 with current usage, limit, reset date, and upgrade URL
- Feature not available on plan → 403 with plan name and upgrade path

## Review Focus

- auth and entitlement checks at correct layer
- request context shape and completeness
- denial behavior with actionable error responses
- duplication between middleware and handlers
- no business logic leaking into middleware
