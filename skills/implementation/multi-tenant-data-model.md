# Skill: Multi-Tenant Data Model

## Use When

- designing SaaS schema
- reviewing tenant isolation
- adding company or workspace scoping

## Guidance

- scope records clearly to tenant, company, or workspace identifiers
- make lifecycle and status columns explicit
- keep relational links obvious and queryable
- support auditing, recovery, and usage tracking in the schema
- avoid ambiguous ownership relationships

## Core Schema Pattern

**Companies** (tenant root):
- ID, name, slug
- Plan reference and subscription status
- Timestamps (`created_at`, `updated_at`)

**Users** (scoped to company):
- Company ID foreign key (every user belongs to a company)
- Role within company (owner, admin, member)
- Auth fields (email, password hash, OAuth provider ID)
- Status fields (email verified, active)

**Plans** (reference data):
- Plan name, display name
- Limits (max users, max API calls monthly)
- Features (JSON or structured column)
- Price and Stripe price ID

## Schema Conventions

- Every table gets `created_at` and `updated_at` timestamps
- Status columns use CHECK constraints with explicit allowed values
- Use TEXT primary keys (UUIDs), not auto-increment integers
- Index foreign keys and status columns
- Soft delete via status column, not row deletion, when audit trail matters

## Usage Tracking

Track API usage per company per billing period:
- Company ID, user ID, feature/worker name
- Success/failure flag
- Error message on failure
- LLM provider used (when applicable)
- Timestamp for billing period queries

This enables: monitoring queries, usage enforcement, billing reconciliation, and debugging — all from the schema.

## Review Focus

- tenant scoping on every core entity (company_id on all user-generated data)
- authorization implications of joins and lookups
- lifecycle visibility (status columns with CHECK constraints)
- migration safety
- indexes on foreign keys and frequently queried columns
- timestamps on all tables
