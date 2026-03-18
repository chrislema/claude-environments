---
name: enforce-thin-proxy
description: Evaluates proxy endpoints to ensure they stay thin — routing, logging, and enriching errors without absorbing business logic.
trigger: When building proxy endpoints, forwarding requests between services, or reviewing boundary layers.
role: engineer
---

## Purpose

Inspects proxy functions to verify they perform exactly four operations — extract, forward, log, return — and flags any business logic, validation, or data transformation that has leaked into the proxy layer.

## Procedure

1. **Enumerate proxy functions.** Identify all proxy endpoints in the codebase that forward requests to feature workers or upstream services.

2. **Verify the four-step pattern in each proxy.** For every proxy function, confirm it does exactly:
   - **Extract**: Pulls request data (body, headers, query params) from the incoming request.
   - **Forward**: Sends the request to the target feature worker or service.
   - **Log**: Records usage to the database (success or failure, with relevant metadata).
   - **Return**: Passes the worker's response back to the caller, enriching with context on error.

3. **Apply the thickness test.** For each proxy, ask:
   - Does this proxy make business decisions? Flag as too thick.
   - Does this proxy validate business rules? Flag as too thick.
   - Does this proxy transform domain data? Flag as too thick.
   - Does this proxy only route, log, and enrich errors? Confirm as correct.

4. **Check error context enrichment.** On error responses, verify the proxy adds operational context from middleware — not business logic:
   - Current usage count
   - Plan limit
   - Remaining allowance
   - Plan name
   - Upgrade URL if applicable

5. **Check consistency across proxies.** Compare all proxy functions against each other. Flag any proxy that does extra work the others do not — all proxies should follow the same four-step pattern.

6. **Check logging and traceability.** Verify every proxy call is logged (both success and failure paths) with enough metadata for debugging and billing reconciliation.

7. **Produce findings.** Document which proxies are clean, which are too thick, and what specific logic needs to move to the worker layer.

## Reference

### The Four Things a Thin Proxy Does

Each proxy function does exactly four things:
1. **Extract** request data
2. **Forward** the request to a feature worker
3. **Log** usage to D1 (success or failure)
4. **Return** the worker's response — with enhanced context on error

Nothing else. No validation logic, no business decisions, no data transformation.

### Error Context Enrichment

On error responses, the proxy adds context from middleware — not business logic:
- Current usage count
- Plan limit
- Remaining allowance
- Plan name
- Upgrade URL if applicable

This makes the proxy thin but the user experience rich.

### Decision Framework

| Question | Answer | Verdict |
|----------|--------|---------|
| Does this proxy make business decisions? | Yes | Too thick |
| Does this proxy validate business rules? | Yes | Too thick |
| Does this proxy transform domain data? | Yes | Too thick |
| Does this proxy route, log, and enrich errors? | Yes | Just right |

### Anti-Patterns

- **Thick proxy**: Validates email format, silently downgrades quality for free users, transforms response data — all of these belong in the worker, not the proxy.
- **Inconsistent proxies**: One proxy does extra logic while others don't. All proxies should do the same four things.
- **Silent failures**: Proxy swallows errors or logs only success paths. Both success and failure must be logged with enough metadata for traceability.
- **Business logic creep**: Starts with "just one small check" and grows. If the check is about domain rules, it belongs in the worker.

### What Belongs Where

| Concern | Proxy | Worker |
|---------|-------|--------|
| Request extraction | Yes | No |
| Request forwarding | Yes | No |
| Usage logging | Yes | No |
| Error enrichment | Yes | No |
| Input validation | No | Yes |
| Business rules | No | Yes |
| Data transformation | No | Yes |
| Quality/tier decisions | No | Yes |
| Response formatting | No | Yes |

## Output

Produce a proxy audit containing:

1. **Proxy inventory**: List of all proxy functions with their target workers.
2. **Thickness assessment**: For each proxy, whether it passes the four-step pattern or has excess logic. Cite the specific lines or logic that violate thinness.
3. **Error enrichment check**: Whether error responses include the required operational context (usage, limits, plan, upgrade URL).
4. **Consistency report**: Whether all proxies follow the same pattern, with specific differences called out.
5. **Migration list**: Any business logic found in proxies that should move to workers, with the specific logic and suggested destination.
