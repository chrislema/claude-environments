---
name: audit-trust-boundaries
description: Audits authentication, authorization, and input validation boundaries to verify trust is established once at entry and not re-checked ad hoc throughout business logic.
trigger: When building or reviewing auth, designing middleware, handling user/webhook/third-party input, or performing security-oriented review.
role: architect, tester
---

## Purpose

Inspects the system's trust architecture to verify that identity is verified once at entry, permissions are checked at capability boundaries, and business logic executes without redundant trust checks. Flags missing validation, scattered re-verification, and mixed concerns.

## Procedure

1. Identify all entry points where untrusted input arrives: API endpoints, webhook handlers, form submissions, third-party integrations, CLI inputs.
2. For each entry point, verify that an authentication boundary exists — identity is verified exactly once before data flows further.
3. Trace the flow from authenticated identity to business logic. Verify that authorization checks occur at capability boundaries (not inside every function).
4. Check that business logic assumes permission and executes without calling auth functions. Flag any `verifyAuth()`, `checkPermission()`, or equivalent calls inside domain logic.
5. Inspect for scattered tenant isolation. Verify that tenant scoping is enforced by middleware or a data access layer, not by appending `AND user_id = ?` to individual queries throughout the codebase.
6. Check for mixed-concern functions: any single function that performs auth + authorization + validation + business logic. Flag for separation.
7. Verify that denial paths are explicit and fast-failing — unauthorized requests are rejected immediately with clear error responses, not allowed to proceed partially.

## Reference

### Trust Zone Architecture

```
UNTRUSTED (raw request)
    |
[Authentication Boundary] — Who are you? (verify once)
    |
TRUSTED (verified identity flows through)
    |
[Authorization Boundary] — Can you do this? (check at capability boundaries)
    |
PERMITTED (business logic executes, assumes permission)
```

### Decision Framework

- **Authentication**: verify identity once at entry.
- **Authorization**: check permissions at capability boundaries only.
- **Business logic**: assume permission, execute.

### Anti-Patterns

- **Re-verification hell**: every function calls `verifyAuth(user)` independently — unclear which check is authoritative.
- **Scattered tenant checks**: `AND user_id = ?` in every database query instead of middleware enforcing tenant scope.
- **Mixed concerns**: a single function doing auth + authorization + validation + business logic.

## Output

Produce the following:

- A map of trust boundaries: where authentication and authorization occur for each entry point.
- A list of missing validation or authorization steps at any entry point.
- All instances of re-verification or scattered trust checks inside business logic.
- Any mixed-concern functions that should be separated into distinct boundary and logic layers.
