---
name: design-tenant-schema
description: Designs or reviews multi-tenant database schemas for tenant isolation, lifecycle tracking, usage auditing, and query safety.
trigger: When designing SaaS schema, reviewing tenant isolation, or adding company or workspace scoping to data models.
role: engineer, architect
---

## Purpose

Evaluates a multi-tenant data model for correct tenant scoping, explicit lifecycle state, audit-ready usage tracking, and safe relational patterns — or produces a schema design that satisfies these requirements.

## Procedure

1. **Identify the tenant root.** Locate the companies (or workspaces/organizations) table that serves as the tenant boundary. Confirm it includes: ID, name, slug, plan reference, subscription status, and timestamps.

2. **Verify tenant scoping on all entities.** For every table that holds user-generated or tenant-specific data:
   - Confirm a `company_id` foreign key exists.
   - Confirm queries filter by `company_id` (no cross-tenant data leakage).
   - Flag any table missing tenant scoping that should have it.

3. **Verify the user model.** Check the users table:
   - Company ID foreign key (every user belongs to a company).
   - Role within company (owner, admin, member) with CHECK constraint.
   - Auth fields (email, password hash, OAuth provider ID).
   - Status fields (email verified, active).

4. **Verify the plans table.** Check that reference data is structured:
   - Plan name, display name.
   - Limits (max users, max API calls monthly).
   - Features (JSON or structured column).
   - Price and Stripe price ID.

5. **Check schema conventions.** Across all tables, verify:
   - `created_at` and `updated_at` timestamps on every table.
   - Status columns use CHECK constraints with explicit allowed values.
   - TEXT primary keys (UUIDs), not auto-increment integers.
   - Foreign keys and status columns are indexed.
   - Soft delete via status column (not row deletion) when audit trail matters.

6. **Verify usage tracking.** Inspect the usage/logs table:
   - Company ID, user ID, feature/worker name.
   - Success/failure flag.
   - Error message on failure.
   - LLM provider used (when applicable).
   - Timestamp for billing period queries.
   - Confirm this supports: monitoring, usage enforcement, billing reconciliation, and debugging.

7. **Evaluate authorization implications.** Review joins and lookups for paths where:
   - A query could return data from another tenant.
   - A join omits the `company_id` filter.
   - A lookup uses user-supplied IDs without verifying tenant ownership.

8. **Check migration safety.** If schema changes are proposed:
   - Confirm new columns have defaults or are nullable.
   - Confirm new constraints won't fail on existing data.
   - Confirm index additions won't cause extended locks on large tables.

9. **Produce findings.** Document the schema assessment with specific gaps and recommendations.

## Reference

### Core Schema Pattern

**Companies** (tenant root):
- ID (TEXT, UUID), name, slug
- Plan reference and subscription status
- `created_at`, `updated_at`

**Users** (scoped to company):
- `company_id` foreign key (every user belongs to a company)
- Role within company: `owner`, `admin`, `member`
- Auth fields: email, password hash, OAuth provider ID
- Status fields: email verified, active

**Plans** (reference data):
- Plan name, display name
- Limits: max users, max API calls monthly
- Features: JSON or structured column
- Price and Stripe price ID

### Schema Conventions

| Convention | Rule |
|-----------|------|
| Timestamps | Every table gets `created_at` and `updated_at` |
| Status columns | CHECK constraints with explicit allowed values |
| Primary keys | TEXT (UUIDs), not auto-increment integers |
| Foreign keys | Always indexed |
| Status columns | Always indexed |
| Soft delete | Via status column, not row deletion, when audit trail matters |

### Usage Tracking Schema

Track API usage per company per billing period:

| Column | Type | Purpose |
|--------|------|---------|
| id | TEXT (PK) | Usage record ID |
| company_id | TEXT (FK) | Tenant association |
| user_id | TEXT (FK) | Who made the request |
| feature | TEXT | Feature or worker name |
| success | BOOLEAN | Success/failure flag |
| error_message | TEXT | Error details on failure (nullable) |
| provider | TEXT | LLM provider used (nullable) |
| created_at | TIMESTAMP | For billing period queries |

This enables: monitoring queries, usage enforcement, billing reconciliation, and debugging — all from the schema.

### Anti-Patterns

- **Missing tenant scope**: A table holds user-generated data but has no `company_id`. Cross-tenant queries become possible.
- **Implicit ownership**: Relying on application logic instead of foreign keys to enforce which company owns a record. Database-level constraints are safer.
- **Auto-increment IDs**: Sequential integers leak information about record counts and creation order. Use UUIDs.
- **Missing timestamps**: Tables without `created_at`/`updated_at` make debugging, auditing, and migration planning difficult.
- **Hard deletes**: Deleting rows instead of setting a status. Loses audit trail and makes recovery impossible.
- **Unconstrained status**: Status columns stored as free-form TEXT without CHECK constraints. Invalid states become possible.
- **Unindexed foreign keys**: Queries that join on `company_id` or filter by status will scan the full table.
- **Ambiguous roles**: Storing roles as free-form strings instead of constrained values. Leads to inconsistent authorization checks.

### Tenant Isolation Checklist

For every query that touches tenant data:
1. Is `company_id` in the WHERE clause?
2. If joining across tables, do both sides filter by the same `company_id`?
3. If using user-supplied IDs (e.g., record ID in URL), is tenant ownership verified before returning data?
4. Are there any admin or reporting queries that could accidentally expose cross-tenant data?

## Output

Produce a schema review or design document containing:

1. **Tenant root assessment**: The companies table structure and whether it serves as a clean tenant boundary.
2. **Scoping audit**: Every table that holds tenant data, whether it has `company_id`, and whether queries properly filter by it.
3. **Convention compliance**: Timestamps, primary key types, CHECK constraints, indexes, soft delete — per table.
4. **Usage tracking assessment**: Whether the usage schema supports monitoring, enforcement, billing, and debugging.
5. **Authorization risk map**: Any queries or joins that could leak data across tenants.
6. **Migration notes** (if applicable): Safety assessment of proposed schema changes.
