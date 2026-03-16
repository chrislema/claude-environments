# Skill: Thin Proxy Pattern

## Use When

- building proxy endpoints
- forwarding requests between services
- reviewing boundary layers

## Guidance

- keep forwarding layers operational, not domain-heavy
- enrich logging and error context without turning the proxy into the feature itself
- keep data transformation minimal and deliberate
- avoid duplicating upstream business logic in the proxy

## The Four Things a Thin Proxy Does

Each proxy function does exactly four things:
1. **Extract** request data
2. **Forward** the request to a feature worker
3. **Log** usage to D1 (success or failure)
4. **Return** the worker's response — with enhanced context on error

Nothing else. No validation logic, no business decisions, no data transformation.

## Error Context Enrichment

On error responses, the proxy adds context from middleware — not business logic:
- Current usage count
- Plan limit
- Remaining allowance
- Plan name
- Upgrade URL if applicable

This makes the proxy thin but the user experience rich.

## Decision Framework

- Does this proxy make business decisions? → Too thick
- Does this proxy validate business rules? → Too thick
- Does this proxy transform domain data? → Too thick
- Does this proxy route, log, and enrich errors? → Just right

## Anti-Patterns

- **Thick proxy**: validates email format, silently downgrades quality for free users, transforms response data — all of these belong in the worker, not the proxy
- **Inconsistent proxies**: one proxy does extra logic while others don't — keep all proxies doing the same four things

## Review Focus

- request forwarding correctness
- logging and traceability (every call logged, success or failure)
- error propagation with enriched context
- accidental domain leakage into the proxy layer
- consistency across all proxy functions
