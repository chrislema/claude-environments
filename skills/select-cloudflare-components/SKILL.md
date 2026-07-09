---
name: select-cloudflare-components
description: Selects Cloudflare infrastructure services and LLM providers for a feature set based on dependency chains, storage needs, and settled policy. Use when assigning services (D1, KV, R2, Durable Objects, Queues, Workflows, Workers AI, Hyperdrive), evaluating whether a feature needs Workflows or Durable Objects, choosing between LLM providers, or confirming a build follows the Workers-first topology.
---

Primary roles: planner, architect

## Purpose

Evaluates a feature set against Cloudflare's infrastructure options on the **Workers-first**
topology (settled policy **S-001**), identifies Workflow and Durable Object candidates,
assigns infrastructure services, and chooses LLM providers per feature (settled policy
**S-002**). The deployment model is not a decision this skill makes per project — it is
settled: standalone Workers with Static Assets, always, unless a source document explicitly
names Pages (see the exception appendix).

## Procedure

1. List all features. For each, note: multi-step dependency chains, need for real-time
   coordination or stateful connections, background/async work, and data shape.
2. Confirm the topology: **standalone Workers with Static Assets** (S-001). Only if the
   vision or spec *explicitly names* Cloudflare Pages does the readout carry a
   `topology_exception` quoting the source line — otherwise there is nothing to decide and
   nothing to split.
3. For each feature with multi-step processing, apply the **dependency chain test**: if one
   operation's output feeds into another's input (A then B then C), use Workflows. If
   operations are independent (even if long-running), do not use Workflows — reach for
   Queues or Cron instead.
4. Assign infrastructure services using the service selection table below. Map data storage,
   compute, caching, background work, and communication needs.
5. For each feature that uses an LLM, select the provider per **S-002**:
   - Default to the cheap/fast model (Llama 4 Scout) for: rule application, calculations,
     structured transformations, format conversion, framework/rubric application, structured
     data extraction.
   - Use Claude for: serious content analysis (nuance, subtle patterns, quality evaluation)
     or serious writing (human voice, creative judgment, voice fidelity).
6. Verify the architecture: services bound in `wrangler.jsonc` across all three env scopes
   (dev/staging/production), every Queue consumer has a dead-letter queue, every new Durable
   Object class declares `new_sqlite_classes`, and no route handler is an exception to the
   thin-handler pattern.

## Reference

### Topology — Workers-first (S-001)

The deployment model is settled: **standalone Cloudflare Workers with Static Assets.** Workers
gets the platform's forward investment — Static Assets routing controls, gradual deployments,
preview URLs, observability, smart placement, SQLite Durable Objects, Workflows — while Pages
does not. There is one deployment model, so the old "consistency principle" holds trivially:
there is nothing to split. Static assets serve from the `ASSETS` binding; the Worker gates
protected paths with `run_worker_first` when the profile has authenticated pages.

### Workflows

Duration is not the deciding factor. Dependency chains are.

- **Use Workflows when:** one operation's output feeds into another's input (A then B then C).
  Import `WorkflowEntrypoint` from `cloudflare:workers`; each step must be idempotent.
- **Don't use Workflows when:** operations are independent, even if long-running. Independent
  parallel or long-running work uses Queues (background) or Cron (scheduled), not orchestration.

### LLM Selection (S-002)

- **Default (Llama 4 Scout)**: fast, nearly zero cost, good enough for most tasks. Handles rule
  application, calculations, structured transformations, format conversion, framework/rubric
  application, structured data extraction.
- **Claude**: serious content analysis (nuance, subtle patterns, quality evaluation) or serious
  writing (human voice, creative judgment, voice fidelity).

### Infrastructure Services

| Service | Use For | v3 notes |
|---------|---------|----------|
| D1 | Multi-tenant relational data, work queues-as-tables, sessions, usage tracking | CHECK-constrained status columns (hygiene-checked) |
| KV | Metadata caching, rate-limit counters for windowed/custom logic | Never relational truth |
| R2 | PDFs, generated media, artifacts, user uploads | — |
| Durable Objects | Real-time coordination, stateful connections | **SQLite-backed**: new classes declare `new_sqlite_classes`; alarms drive recovery loops |
| Queues | Background/async work | **Every consumer sets `max_retries` + a `dead_letter_queue`** — a DLQ-less queue is a banned silent fallback |
| Workflows | Multi-step processes with dependency chains | `WorkflowEntrypoint` from `cloudflare:workers`; idempotent steps |
| Workers AI | Inference at the edge | Binding named exactly `AI`; local dev proxies remote (`remote: true`); tests mock it |
| Hyperdrive | Pooled access to an existing external Postgres | Only when the spec names an existing Postgres — not a default |
| Rate limiting | Simple per-key limits | Native rate-limiting binding replaces hand-rolled KV counters for the simple case |
| Service Bindings | Worker-to-worker communication | Scaffolded singly; meshes are planned-for, not built |
| Cron Triggers | Usage resets, cleanup, monitoring, recovery sweeps | — |

**Smart placement**: `mode: "smart"` for D1/backend-heavy profiles; off for pure edge/asset
serving.

### Decision Defaults

When uncertain:
1. Ask clarifying questions — don't guess at intent.
2. Explain the tradeoffs — present options with reasoning.
3. Default to simplicity — the simpler option is usually right.

## Output

Produce the following:

- Confirmation of the Workers-first topology (S-001), and the `topology_exception` quote if a
  source named Pages.
- Workflow candidates identified by their dependency chains, with the chain spelled out.
- Infrastructure service assignments per feature, including Queue DLQ policy and any SQLite DO
  classes.
- LLM provider assignment per feature with rationale (why the cheap model or why Claude, S-002).

## Appendix — the Cloudflare Pages exception (rare)

Pages is **not** chosen by inference or preference; only when the vision or spec *explicitly
names* Cloudflare Pages. When it does:

- The readout records a `topology_exception` with the exact `{quote, source, line}`.
- The plan's `scaffold_profile` sets `topology: "pages"`, and the deterministic
  `topology_matches_policy` gate verifies the exception artifact exists.
- The old Pages decision framework — deployment-overhead tradeoffs, the Pages-vs-Workers
  bundling question, Pages Functions middleware layout — applies only inside this exception
  path. Everywhere else it is superseded by S-001.
