---
name: design-cache-strategy
description: Designs or audits caching layers by classifying data staleness tolerance, selecting cache strategies, and verifying write-time invalidation.
trigger: When designing data access patterns, reviewing performance, adding caching to existing systems, or debugging stale data issues.
role: architect, engineer
---

## Purpose

Evaluates data access patterns to determine what should be cached, at what TTL, and with what invalidation strategy. Verifies that the database remains the source of truth, caches are invalidated on writes, and no cache-as-truth patterns exist.

## Procedure

1. Inventory all data types accessed in the system under review. List each by name and access pattern (read frequency, write frequency).
2. For each data type, determine the staleness tolerance by asking: "What is the worst case if this data is stale?" Classify using the consistency requirements table.
3. For each data type that should be cached, select the cache layer (in-memory, CDN, browser, KV store) based on access pattern and staleness tolerance.
4. Design the cache key strategy for each cached data type. Ask: "Can you invalidate precisely, or must you invalidate broadly?" Prefer precise invalidation.
5. Verify the cache pattern for each layer:
   - Check cache first (key + TTL check).
   - On miss: query database, populate cache with timestamp.
   - On write: delete the specific cache entry (precise invalidation).
   - Never update cache contents directly — delete and let the next read repopulate.
6. Audit for anti-patterns: cache treated as truth, broad invalidation on single-record changes, TTL-only invalidation after known state changes, and read-time staleness checks.
7. Confirm the database is treated as canonical for every cached data type. Flag any path where cached data could be trusted over the database.

## Reference

### Consistency Requirements

| Data Type | Staleness Tolerance | Strategy |
|-----------|---------------------|----------|
| User session | 5 minutes | In-memory with TTL |
| Subscription status | 5 minutes | In-memory, invalidate on webhook |
| Product catalog | 1 hour | CDN cache |
| Real-time inventory | 0 seconds | No cache, query fresh |
| User preferences | 1 day | Browser localStorage + server cache |
| Static assets | Forever | CDN with versioned URLs |

### Cache Pattern

- Check cache first (key + TTL check).
- On miss: query database, populate cache with timestamp.
- On write: delete the specific cache entry (precise invalidation).
- Never update cache contents directly — delete and let the next read repopulate.

### Decision Questions

- What's the worst case if this data is stale? (determines TTL)
- How often does this data change? (determines whether to cache at all)
- What's the cost of a cache miss? (determines cache layer)
- Can you invalidate precisely or must you invalidate broadly? (determines cache key strategy)

### Anti-Patterns

- **Cache as truth**: treating cached subscription status as authoritative instead of the database.
- **Broad invalidation**: flushing all cached data when one record changes.
- **No invalidation**: relying entirely on TTL expiry, even after known state changes (like a webhook).
- **Read-time invalidation**: checking "is this stale?" on every read instead of invalidating on writes.

## Output

Produce the following:

- A data type inventory with staleness tolerance, recommended cache layer, and TTL for each.
- The cache key strategy and invalidation mechanism for each cached data type.
- A list of any cache-as-truth, broad invalidation, or missing invalidation patterns found.
- Confirmation that the database remains the canonical source of truth for all cached data.
