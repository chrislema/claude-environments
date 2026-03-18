---
name: design-observability
description: Evaluates schemas and systems for intrinsic observability — timestamps, status tracking, and usage data that enable monitoring through database queries rather than external tools.
trigger: When designing database schemas, reviewing operational readiness, adding monitoring to existing systems, or evaluating whether production issues can be diagnosed.
role: architect, engineer
---

## Purpose

Audits database schemas and system designs to ensure observability is built into the data model rather than bolted on as external instrumentation. Verifies that timestamps, status columns, and usage tracking exist so that monitoring, debugging, and billing can all be served from the same data.

## Procedure

1. Inventory all database tables and data stores in the system under review.
2. For each table, check for `created_at` and `updated_at` columns. Flag any table missing either.
3. For tables with lifecycle state, check for `processed_at` or equivalent completion timestamps. Flag any workflow or job table without completion tracking.
4. Verify that status columns use constrained values (CHECK constraints or enum types). Flag any free-text or unconstrained status fields.
5. Apply the observability test to each major subsystem:
   - Can you answer "how many jobs are in state X?" with a query? (Flag if no.)
   - Can you calculate error rates without external tools? (Flag if no.)
   - Can you identify bottlenecks from your data? (Flag if no.)
   - Can you audit "what happened to request #123?" from logs and database? (Flag if no.)
6. Audit usage tracking: verify the system records who called what, when, success/failure, duration (if relevant), and error details on failure. Check that this data supports billing enforcement, rate limiting, error rate monitoring, and debugging.
7. Flag any fire-and-forget patterns: operations that complete but leave no trace in the database or logs.

## Reference

### Observable Schema Design

Every table should support monitoring queries naturally:
- `created_at` and `updated_at` on all tables.
- `processed_at` or completion timestamps where applicable.
- Status columns with constrained values (CHECK constraints).
- Enough data to answer: "how many X are in state Y right now?"

### Usage Tracking as Architecture

Track API usage as part of the data model, not as a separate logging system:
- Who called what (user, company).
- When (timestamp).
- Success or failure.
- Duration if relevant.
- Error details on failure.

This enables: billing enforcement, rate limiting, error rate monitoring, and debugging — all from the same data.

### Observability Test

- Can you answer "how many jobs are in state X?" with a query? (should be yes)
- Can you calculate error rates without external tools? (should be yes)
- Can you identify bottlenecks from your data? (should be yes)
- Can you audit "what happened to request #123?" from logs and database? (should be yes)

### Anti-Patterns

- **Monitoring as afterthought**: schema has no timestamps, status is implicit, adding monitoring requires a new system.
- **External-only observability**: can only see system health through a third-party dashboard, not from querying your own data.
- **Fire-and-forget**: operations complete but leave no trace — you can't tell what happened or when.

## Output

Produce the following:

- A table-by-table audit showing: presence of timestamps, status column type and constraints, and completion tracking.
- A list of tables or operations missing observability fields, with specific columns to add.
- An assessment of usage tracking coverage: what is tracked, what is missing, and what queries it does or does not support.
- All fire-and-forget patterns identified, with recommendations for adding traceability.
