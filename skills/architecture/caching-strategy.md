# Skill: Caching Strategy

## Use When

- designing data access patterns
- reviewing performance
- adding caching to existing systems
- debugging stale data issues

## Guidance

- cache aggressively, invalidate precisely
- not everything needs real-time data — know your consistency requirements
- caches are optimization, not truth — the database is always canonical
- invalidate on writes, not on reads

## Consistency Requirements

| Data Type | Staleness Tolerance | Strategy |
|-----------|---------------------|----------|
| User session | 5 minutes | In-memory with TTL |
| Subscription status | 5 minutes | In-memory, invalidate on webhook |
| Product catalog | 1 hour | CDN cache |
| Real-time inventory | 0 seconds | No cache, query fresh |
| User preferences | 1 day | Browser localStorage + server cache |
| Static assets | Forever | CDN with versioned URLs |

## Cache Pattern

- Check cache first (key + TTL check)
- On miss: query database, populate cache with timestamp
- On write: delete the specific cache entry (precise invalidation)
- Never update cache contents directly — delete and let the next read repopulate

## Decision Framework

- What's the worst case if this data is stale? (determines TTL)
- How often does this data change? (determines whether to cache at all)
- What's the cost of a cache miss? (determines cache layer)
- Can you invalidate precisely or must you invalidate broadly? (determines cache key strategy)

## Anti-Patterns

- **Cache as truth**: treating cached subscription status as authoritative instead of the database
- **Broad invalidation**: flushing all cached data when one record changes
- **No invalidation**: relying entirely on TTL expiry, even after known state changes (like a webhook)
- **Read-time invalidation**: checking "is this stale?" on every read instead of invalidating on writes

## Output Expectations

- identify what should be cached and appropriate TTL
- verify cache invalidation happens on writes
- check that the database remains the source of truth
- flag any cache-as-truth patterns
