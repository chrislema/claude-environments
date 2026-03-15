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

## Review Focus

- request forwarding correctness
- logging and traceability
- error propagation
- accidental domain leakage into the proxy layer
