# Skill: Observability

## Use When

- designing database schemas
- reviewing operational readiness
- adding monitoring to existing systems
- evaluating whether production issues can be diagnosed

## Guidance

- observability is architecture, not instrumentation — it's not "added," it's intrinsic
- timestamps on everything
- status tracking is part of design, not an afterthought
- monitoring should be a database query, not a separate tool

## Observable Schema Design

Every table should support monitoring queries naturally:
- `created_at` and `updated_at` on all tables
- `processed_at` or completion timestamps where applicable
- Status columns with constrained values (CHECK constraints)
- Enough data to answer: "how many X are in state Y right now?"

## Usage Tracking as Architecture

Track API usage as part of the data model, not as a separate logging system:
- Who called what (user, company)
- When (timestamp)
- Success or failure
- Duration if relevant
- Error details on failure

This enables: billing enforcement, rate limiting, error rate monitoring, and debugging — all from the same data.

## Decision Framework

- Can you answer "how many jobs are in state X?" with a query? (should be yes)
- Can you calculate error rates without external tools? (should be yes)
- Can you identify bottlenecks from your data? (should be yes)
- Can you audit "what happened to request #123?" from logs and database? (should be yes)

## Anti-Patterns

- **Monitoring as afterthought**: schema has no timestamps, status is implicit, adding monitoring requires a new system
- **External-only observability**: can only see system health through a third-party dashboard, not from querying your own data
- **Fire-and-forget**: operations complete but leave no trace — you can't tell what happened or when

## Output Expectations

- verify timestamps exist on all tables
- check that status columns support monitoring queries
- confirm usage tracking captures enough for billing and debugging
- flag any fire-and-forget patterns
