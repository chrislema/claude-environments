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

## Subscription Storage

Use a separate subscriptions table (not embedded in companies) for historical tracking and auditing:
- Status: constrained to `active`, `past_due`, `canceled`, `trial`
- Track `started_at`, `expires_at`, `trial_ends_at`
- Store Stripe IDs (`stripe_subscription_id`, `stripe_customer_id`)
- Index on `status + expires_at` and `stripe_subscription_id`

## Subscription Context with Caching

Cache subscription lookups with a 5-minute TTL to avoid repeated database queries on every request. Include in the cached context:
- Plan details (name, limits, features)
- Current usage count (for the billing period)
- User count
- Derived status (is it active AND not expired?)

Invalidate cache precisely on webhook events — delete the company's cache entry, don't flush everything.

## Plan Enforcement

Enforce subscription status and usage limits in API middleware, not in individual handlers:
- Check subscription status → 403 if inactive with renewal URL
- Calculate current usage → 429 if limit exceeded with usage stats and reset date
- Check feature access → 403 if feature not on plan with upgrade path

## Review Focus

- webhook verification and signature checking
- idempotency (handle duplicate webhook deliveries)
- lifecycle state mapping (Stripe status → local status)
- entitlement changes after billing events
- cache invalidation on subscription changes
- plan enforcement in middleware, not scattered in handlers
