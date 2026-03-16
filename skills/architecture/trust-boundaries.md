# Skill: Trust Boundaries

## Use When

- building or reviewing auth
- designing middleware
- handling user, webhook, or third-party input
- doing security-oriented review

## Guidance

- validate untrusted input at entry points
- verify identity and entitlement at the boundary
- trust verified request context inside the boundary
- avoid repeated ad hoc trust checks deep in business logic
- make denial paths explicit and fast-failing

## Trust Zone Architecture

```
UNTRUSTED (raw request)
    ↓
[Authentication Boundary] — Who are you? (verify once)
    ↓
TRUSTED (verified identity flows through)
    ↓
[Authorization Boundary] — Can you do this? (check at capability boundaries)
    ↓
PERMITTED (business logic executes, assumes permission)
```

## Decision Framework

- **Authentication**: verify identity once at entry
- **Authorization**: check permissions at capability boundaries only
- **Business logic**: assume permission, execute

## Anti-Patterns

- **Re-verification hell**: every function calls `verifyAuth(user)` independently — unclear which check is authoritative
- **Scattered tenant checks**: `AND user_id = ?` in every database query instead of middleware enforcing tenant scope
- **Mixed concerns**: a single function doing auth + authorization + validation + business logic

## Output Expectations

- define the trust boundary
- name what is verified there
- list any missing validation or authorization steps
- call out any re-verification or scattered trust checks
