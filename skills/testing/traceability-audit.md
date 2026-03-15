# Skill: Traceability Audit

## Use When

- reviewing implementation completeness
- validating frontend-to-backend wiring
- checking route, handler, middleware, or storage consistency

## Guidance

- trace real flows across UI, handlers, middleware, and storage
- focus on broken wiring, dead paths, and naming drift
- look for duplicate route ownership or inconsistent binding names
- produce findings that map to specific remediation tasks

## Review Focus

- missing handler implementations
- duplicate route or middleware ownership
- storage binding mismatches
- naming drift across related layers
