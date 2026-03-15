# Skill: Stripe Subscription Lifecycle

## Use When

- adding billing
- implementing checkout
- handling Stripe webhooks
- reviewing subscription state changes

## Guidance

- make billing state transitions explicit
- treat Stripe webhooks as authoritative inputs for subscription state changes
- keep the local subscription model clear and auditable
- surface edge cases like failed payment, cancellation, and past_due explicitly
- avoid optimistic assumptions that billing succeeded

## Review Focus

- webhook verification
- idempotency
- lifecycle state mapping
- entitlement changes after billing events
