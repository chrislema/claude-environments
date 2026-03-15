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

## Review Focus

- tenant scoping on every core entity
- authorization implications of joins and lookups
- lifecycle visibility
- migration safety
