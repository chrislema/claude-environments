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

## Output Expectations

- define the trust boundary
- name what is verified there
- list any missing validation or authorization steps
