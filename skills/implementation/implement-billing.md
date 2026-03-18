---
name: implement-billing
description: Implements or reviews Stripe subscription billing — checkout, webhook handling, subscription state management, caching, and plan enforcement.
trigger: When adding billing, implementing checkout, handling Stripe webhooks, or reviewing subscription state changes.
role: engineer
---

## Purpose

Guides the implementation of Stripe subscription lifecycle management — from checkout through webhook-driven state transitions to plan enforcement — ensuring billing state is explicit, auditable, and authoritative.

## Procedure

1. **Verify subscription storage.** Inspect the subscriptions table:
   - Confirm it is a separate table (not embedded in the companies table).
   - Confirm status is constrained to `active`, `past_due`, `canceled`, `trial`.
   - Confirm it tracks `started_at`, `expires_at`, `trial_ends_at`.
   - Confirm it stores `stripe_subscription_id` and `stripe_customer_id`.
   - Confirm indexes exist on `status + expires_at` and `stripe_subscription_id`.

2. **Verify webhook handling.** Inspect Stripe webhook endpoints:
   - Confirm webhook signature verification is present and happens before any processing.
   - Confirm idempotency: duplicate webhook deliveries do not corrupt state (use `stripe_subscription_id` as idempotency key or check current state before applying transitions).
   - Confirm lifecycle state mapping: verify the mapping from Stripe statuses to local statuses is explicit and complete.
   - Confirm entitlement changes: after a billing event, the user's access reflects the new subscription state.

3. **Verify subscription caching.** Inspect the caching layer:
   - Confirm subscription lookups are cached with a 5-minute TTL.
   - Confirm the cached context includes: plan details (name, limits, features), current usage count, user count, derived status (active AND not expired).
   - Confirm cache invalidation: webhook events delete the specific company's cache entry (not a full flush).

4. **Verify plan enforcement.** Confirm enforcement happens in API middleware, not in individual handlers:
   - Subscription status check: 403 if inactive, with renewal URL.
   - Usage limit check: 429 if exceeded, with usage stats and reset date.
   - Feature access check: 403 if feature not on plan, with upgrade path.

5. **Check edge cases.** Verify handling of:
   - Failed payments (transition to `past_due`, not immediate cancellation).
   - Cancellation (what happens to access during remaining paid period).
   - Trial expiration (transition to appropriate state).
   - Plan upgrades/downgrades mid-cycle.
   - Duplicate webhook deliveries.

6. **Produce findings.** Document the billing implementation against each checkpoint with specific gaps called out.

## Reference

### Subscription Storage Schema

Use a separate subscriptions table (not embedded in companies) for historical tracking and auditing:

| Column | Type | Purpose |
|--------|------|---------|
| id | TEXT (PK) | Subscription record ID |
| company_id | TEXT (FK) | Tenant association |
| status | TEXT | Constrained: `active`, `past_due`, `canceled`, `trial` |
| started_at | TIMESTAMP | When the subscription began |
| expires_at | TIMESTAMP | When access expires |
| trial_ends_at | TIMESTAMP | When trial period ends (nullable) |
| stripe_subscription_id | TEXT | Stripe's subscription ID |
| stripe_customer_id | TEXT | Stripe's customer ID |
| created_at | TIMESTAMP | Record creation |
| updated_at | TIMESTAMP | Last modification |

**Indexes:** `status + expires_at`, `stripe_subscription_id`

### Subscription Context (Cached)

Cache subscription lookups with a 5-minute TTL to avoid repeated database queries on every request:

```
{
  plan: { name, limits, features },
  usage: { current, limit, remaining },
  userCount: number,
  status: "active" | "past_due" | "canceled" | "trial",
  isActive: boolean  // active AND not expired
}
```

Invalidate cache precisely on webhook events — delete the company's cache entry, don't flush everything.

### Stripe Status to Local Status Mapping

| Stripe Event | Local Status | Action |
|-------------|-------------|--------|
| `checkout.session.completed` | `active` | Create subscription, set `started_at` |
| `invoice.paid` | `active` | Confirm active, update `expires_at` |
| `invoice.payment_failed` | `past_due` | Update status, notify user |
| `customer.subscription.updated` | varies | Map Stripe status to local, update fields |
| `customer.subscription.deleted` | `canceled` | Update status, set `expires_at` to period end |

### Plan Enforcement (in Middleware)

Enforce subscription status and usage limits in API middleware, not in individual handlers:
- Check subscription status: 403 if inactive with renewal URL
- Calculate current usage: 429 if limit exceeded with usage stats and reset date
- Check feature access: 403 if feature not on plan with upgrade path

### Anti-Patterns

- **Optimistic billing**: Assuming checkout succeeded without webhook confirmation. Always wait for Stripe's authoritative event.
- **Embedded subscription data**: Storing subscription fields directly on the company record. Loses history, makes auditing impossible.
- **Missing idempotency**: Processing duplicate webhooks leads to double-counting, incorrect state, or duplicate notifications.
- **Scattered enforcement**: Checking plan limits in individual handlers instead of middleware. Some endpoints will be missed.
- **Full cache flush**: Invalidating all cached subscriptions when one changes. Defeats the purpose of caching.
- **Silent status transitions**: Changing subscription status without logging the event or the Stripe event that caused it.

## Output

Produce a billing implementation review containing:

1. **Storage audit**: Subscription table structure vs. expected schema, with missing columns, constraints, or indexes called out.
2. **Webhook audit**: Signature verification, idempotency handling, state mapping completeness, and entitlement propagation.
3. **Cache audit**: TTL, cached fields, invalidation strategy — with gaps identified.
4. **Enforcement audit**: Where plan checks happen (middleware vs. handlers), what denial responses include, and any enforcement gaps.
5. **Edge case coverage**: How failed payments, cancellations, trial expirations, and plan changes are handled — with any missing paths called out.
