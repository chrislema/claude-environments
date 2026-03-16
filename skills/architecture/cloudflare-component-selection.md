# Skill: Cloudflare Component Selection

## Use When

- deciding between Pages Functions and standalone Workers
- evaluating whether a feature needs Workflows or Durable Objects
- choosing between LLM providers for a feature
- reviewing architecture for deployment consistency

## Pages Functions vs Standalone Workers

The decision is about **deployment overhead**, not code complexity.

**Keep everything in Pages Functions when:**
- Features don't need independent iteration
- No feature requires Workflows or Durable Objects
- The app is cohesive and deploys as a unit
- No need to monitor individual features separately

**Extract to standalone Workers when:**
- The feature uses Workflows (Workflows need Workers to run)
- The feature needs Durable Objects (real-time coordination, stateful connections)
- You plan to iterate on this feature repeatedly or expect to change the approach

## The Consistency Principle

Never split features between Pages Functions and Workers. If some features are in Workers, all features go in Workers. If features are in Functions, all stay in Functions.

This applies to everything: forms, logging, security. The thin proxy pattern should do the same thing everywhere — no exceptions where "this one does a little more."

## Workflows

Duration is not the deciding factor. **Dependency chains** are.

**Use Workflows when:** one operation's output feeds into another operation's input (A → B → C).

**Don't use Workflows when:** operations are independent, even if they're all long-running. Independent parallel operations don't need orchestration.

## LLM Selection

**Default: Llama 4 Scout** — fast, nearly zero cost, good enough for most tasks.

**Use Claude when:** the task requires serious content analysis (nuance, subtle patterns, quality evaluation) or serious writing (human voice, creative judgment, voice fidelity).

**Llama handles:** rule application, calculations, structured transformations, format conversion, framework/rubric application, structured data extraction.

## Infrastructure Services

| Service | Use For |
|---------|---------|
| Workers | Stateless compute, auth, business logic, data processing |
| Pages | Static hosting, serverless functions, API proxies, UI |
| D1 | Multi-tenant data, work queues, usage tracking, sessions |
| R2 | PDFs, generated media, artifacts, user uploads |
| KV | Metadata caching, rate limit counters |
| Workflows | Multi-step processes with dependency chains |
| Durable Objects | Real-time coordination, stateful connections |
| Service Bindings | Worker-to-worker communication |
| Cron Triggers | Usage resets, cleanup, monitoring, recovery |

## Decision Framework

When uncertain:
1. Ask clarifying questions — don't guess at intent
2. Explain the tradeoffs — present options with reasoning
3. Default to simplicity — the simpler option is usually right

## Output Expectations

- name the deployment model (Pages-only or Workers)
- justify any standalone Worker extractions
- identify Workflow candidates by dependency chain
- assign LLM provider per feature with rationale
- verify consistency (no split between Pages and Workers)
