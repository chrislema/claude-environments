# v3 Spec — From Delivery Engine to Evidence Engine

*Successor to `spec.md` (v2). v2 re-homed judgment into executable mechanisms. v3 hardens
those mechanisms against everything we learned from running v2's sibling experiment
(`mastra-builder`) into the ground on a real benchmark — and re-encodes the settled
Cloudflare topology as Workers-first. When v3 work begins, this file replaces `spec.md`;
decision and phase numbering continues from v2 (D9+, P7+).*

*Written for implementation by Sonnet-class builders under the existing pipeline
discipline: every phase below is sized to be a judged, bounded, boundary-enforced task
sequence. No phase requires rewriting judgment content except where a mechanism change or
the Workers supersession (S-001) forces it.*

---

## Problem

v2 works, and v2 is thin — in specific, known places.

The sibling repo (`mastra-builder`) took v2's exact design — same checks, same rubric
format, same judge contract, same `.delivery/` state — compiled it into an in-process
TypeScript runtime, and iterated it against a real paid benchmark. That experiment is the
most valuable test this repo never ran. It produced four lessons and three anti-lessons,
and v3 exists to absorb both lists.

**What mastra proved (adopt):**

1. **Fact-shaped work should not be model work.** The single biggest reliability gain came
   from *removing* the model from stages whose output is computable: project scaffolding,
   release-gate synthesis from executed evidence, deployment reporting. Every one of those
   removals eliminated an entire class of judged failure.
2. **Evidence can be real.** `wrangler deploy --dry-run`, `wrangler check startup`,
   `wrangler types --check`, local D1 migrations, and live `wrangler dev` HTTP probes are
   all cheap, deterministic, and executable inside the run. "Some code ran before the
   stage ended" — our current evidence floor — is embarrassing next to that.
3. **Retries deserve a diagnosis.** A uniform bounce-with-remediation wastes attempts on
   failure classes it cannot fix (didn't write anything, blocked by boundary, judge
   outage). Classifying the failure and reshaping the retry roughly doubled useful
   attempts per budget.
4. **The engine's own evolution needs doctrine.** Run journals, cheap-proof-before-paid-run,
   forward-progress scoreboards. mastra's most expensive bugs were fixed one paid run at a
   time until the author wrote rules against exactly that.

**What mastra proved by failing (avoid):**

1. **Harness code absorbs product knowledge unless something stops it.** Its policy
   modules ended up hardcoding one benchmark product's route paths, table names, and
   domain nouns — the exact "bad contract" its own doctrine forbade. Code that *does* the
   work must *know* the product; a general harness must not. v3 makes product-blindness a
   deterministic invariant, not a hope (D17).
2. **Deep evidence invites laundering.** Once real commands run, it is tempting to mark a
   critical area "verified" because a passing command's output happened to contain the
   word `auth`. Keyword inference is confident narration wearing an evidence costume. v3
   bans inferred verification statuses structurally (D12).
3. **Unwired judgment rots.** 9 of mastra's 12 rubrics ended up dead, its README drifted
   from its code, and two agents were registered that nothing invoked. Every mechanism v3
   adds either runs in the pipeline or has an explicit activation criterion (D18); nothing
   ships dormant.

**And v2's own known defects, all fixed in v3:**

- The "deterministic" gate path routes through an LLM transcriber (a runner agent
  collects and *rewrites* check output JSON) — determinism by courtesy. (P8)
- The blocking hooks match `Write|Edit|MultiEdit` only; `bash -c 'cat > file'` bypasses
  boundary and crypto enforcement, and the post-hoc boundary check misses it too. (P9)
- `module_loads` is a phantom: the implementation rubric promises "loads in an isolate
  and answers one request," but the gate is mapped to `ran_code_before_complete` (any
  Bash at all). (P11 makes it real.)
- A review report judged FAIL re-runs the architect with the remediation computed and
  then *dropped*; a planner revision after an architect block is never re-judged. (P8)
- One global 0.7 threshold regardless of rubric hardness; `max_turns` config nothing
  consumes; crypto-guard sees only the edited fragment, so a violation assembled across
  two edits passes. (P8, P9)
- The designer's strict visual rules — the most mechanically checkable prose in the repo —
  have no deterministic teeth. (P9)
- The settled topology policy is **stale**: it encodes Pages Functions as the default.
  Chris's position has changed — Workers-first, because Cloudflare is visibly converging
  on Workers and leaving Pages behind (Static Assets on Workers is the successor;
  Pages feature development has effectively stopped). v3 records this as supersession
  S-001 and re-encodes every consumer. (P7)

---

## The Three Theses of v3

v2 had one organizing rule (the sorting principle). v3 keeps it and adds three theses
that govern *how the buckets are used*:

**T1 — Facts are computed; judgments are judged.**
If a pipeline output is a *fact about the world* (does this config parse, did this
command exit 0, did this probe return 200, what files exist), code produces it and code
checks it. If it is a *judgment* (is this plan coherent, is this probe plan sufficient,
is this diff the smallest coherent change), a model produces it and a judge grades it.
The v2 pipeline blurred this: the tester *authored* the release gate (a fact artifact)
and a judge graded the authorship. v3 splits it: the model authors the **probe plan**
(judgment: what should be proven), code **executes** it and **synthesizes** the gate
(fact: what was proven). Same split for scaffolding: the planner *chooses* the profile
(judgment), code *materializes* it (fact).

**T2 — The deterministic path is deterministic end-to-end.**
No model token generation may sit between a check's execution and the file the gate
reads. Scripts write their own outputs and register their own events. Agents may *launch*
commands; they may never *transcribe* results.

**T3 — The harness is product-blind.**
The engine may know Cloudflare, Wrangler, HTTP, SQL, and its own artifact vocabulary. It
may never know a product's routes, tables, or nouns. Product specificity enters a run
through exactly three doors — the vision/spec documents, the planner's judged artifacts,
and the tester's judged probe plan — all of them data, none of them engine code. This is
enforced deterministically (D17), because mastra proved prose alone cannot hold this line
under debugging pressure.

---

## S-001 — Topology Supersession: Workers-first

The first entry in the new settled-policy registry (D14), recorded here in full because
it changes judgment content, not just mechanism:

- **Superseded position** (v1/v2): "If no feature needs Workflows or Durable Objects and
  features deploy as a cohesive unit, the deployment model is Pages Functions."
  (`skills/select-cloudflare-components`, `agents/planner.md`, `policy/boundaries.json`
  layout, `settled_policy_respected` gate semantics.)
- **New position**: **Standalone Cloudflare Workers with Static Assets, always,** unless
  the vision or spec *explicitly names* Cloudflare Pages — in which case the readout must
  record a `topology_exception` quoting the exact source line, and the plan gate verifies
  the exception artifact exists. No inference, no regex divination of intent: the
  exception is declared by the human's documents or it does not exist.
- **Rationale**: Cloudflare's platform investment has converged on Workers. Workers
  Static Assets supersedes Pages hosting; Workers gets the new runtime capabilities
  (Static Assets routing controls, gradual deployments, preview URLs, observability,
  smart placement, SQLite Durable Objects, Workflows) while Pages does not. Building on
  Pages in 2026 is building on a maintenance track.
- **Consequences propagated by P7**: `select-cloudflare-components` rewritten;
  `boundaries.json` layout replaced (no more `functions/api/*`); planner/engineer/
  architect prompts updated; `settled_policy_respected` gate re-anchored to the registry;
  the consistency principle survives in stronger form — *there is only one deployment
  model, so there is nothing to split.*

The old Pages knowledge is not deleted — the decision framework moves into the skill's
"when the human explicitly asks for Pages" appendix, clearly marked as the exception
path.

---

## The Workers-First Target Shape

What the engine builds when nothing exotic is requested. This section is judgment
content (it feeds the skill rewrite, the scaffold profiles, and the hygiene checks) and
is the canonical statement Sonnet should implement from.

### Canonical repo layout (replaces the Pages layout in `policy/boundaries.json`)

```
src/
  index.js|ts            # Worker entrypoint: fetch (+ queue/scheduled/email as profiled)
  routes/*.js|ts         # request handlers — thin, assume-permission
  middleware/*.js|ts     # session/context at the edge of the Worker, layered per skill
  services/*.js|ts       # domain logic (the "feature worker" layer from v2, now modules)
  lib/*.js|ts            # shared utilities
public/                  # static assets (vanilla HTML/CSS/JS — designer-owned)
migrations/*.sql         # D1 migrations, numbered, applied via wrangler
tests/                   # vitest (Workers pool) unit + integration
wrangler.jsonc
package.json
.dev.vars                # local secrets, gitignored — never committed
```

Role boundaries: engineer owns `src/**`, `migrations/**`, `wrangler.jsonc`,
`package.json`, `tests/**`; designer owns `public/**`; both forbidden from `.dev.vars`
reads/writes beyond scaffold; scaffold-owned files (below) are **readonly** to both.

### `wrangler.jsonc` contract (scaffold-generated; hygiene-checked thereafter)

- `$schema: "node_modules/wrangler/config-schema.json"` — config completions and
  validation are free; take them.
- `name`, `main: "src/index.js|ts"`, `compatibility_date` stamped with the scaffold
  date. Hygiene check warns (not blocks) when the date falls more than 180 days behind
  the run date — stale compat dates silently freeze runtime behavior.
- `compatibility_flags: ["nodejs_compat"]` — the modern flag; unlocks `node:*` builtins
  under workerd without polyfill weight.
- `assets: { directory: "./public", binding: "ASSETS" }`. When the profile includes
  authenticated pages, add `run_worker_first` for the protected paths so the Worker
  gates asset access; otherwise assets serve directly from the edge (faster, free).
  `not_found_handling: "single-page-application"` only when the spec declares an SPA —
  the default is plain 404, because vanilla multi-page is our default frontend.
- `observability: { enabled: true, head_sampling_rate: 1 }` — Workers Logs on from the
  first deploy. Sampling can be tuned down later; missing telemetry cannot be tuned up
  retroactively.
- **Environments are explicit and mirrored**: top-level config is the dev/local shape;
  `env.staging` and `env.production` each carry the *complete* set of bindings and vars,
  because **Wrangler does not inherit bindings into named environments** — a missing
  mirror is the classic silent-breakage path. The hygiene check verifies mirror
  completeness structurally (same binding names in all three scopes, env-specific IDs).
- Bindings per profile (see scaffold profiles below); secrets never appear in config —
  `vars` is for non-secret config only; secrets go through `wrangler secret put --env`
  and `.dev.vars` locally. Deterministic check `no_secrets_in_config` scans config and
  committed files for secret-shaped values (long high-entropy literals, `sk-`/`key`/
  `token`-named vars with literal values).
- Custom domains: production-only `routes` with `custom_domain: true`, present only when
  source-declared; staging stays on `workers.dev`.

### `package.json` scripts contract

```
dev        → wrangler dev                      # local workerd, local D1/KV/R2 simulators
test       → vitest run                        # @cloudflare/vitest-pool-workers
typecheck  → wrangler types && tsc --noEmit    # TS profile only; generated Env, never hand-written
deploy     → wrangler deploy --env production  # humans run this; the engine uses the versioned path (D19)
```

TypeScript Workers use **generated types**: `worker-configuration.d.ts` is verification
output (`wrangler types`), gitignored or committed-but-never-hand-edited; `tsconfig`
includes it. Vanilla JS remains the default; TS is a source-declared exception (carried
over from v2 judgment, unchanged).

### Testing contract (this is what makes `module_loads` real)

`@cloudflare/vitest-pool-workers` is the standard harness: tests execute *inside
workerd* against the real `wrangler.jsonc`, with `SELF.fetch()` for integration tests
and isolated per-test storage for D1/KV/R2/DO. This gives the engine an executable
definition for every tier:

| Tier | Meaning in v3 (executable, not nominal) |
|---|---|
| `smoke` | module loads in workerd and `/health` answers 200 via `SELF.fetch` (the scaffold ships this test) |
| `api` | the vitest integration suite (tester-authored) passes in the Workers pool |
| `e2e` | the probe plan (D13) executes green against a live `wrangler dev` instance |
| `full_matrix` | e2e probes re-executed against a **staging deploy** (preview URL), plus migrations applied remotely to staging |

`tier_order` semantics are unchanged; the tiers finally denote evidence classes instead
of aspirations. `pre_deployment` requires all four — which is now achievable, so the
v2 problem of nominal `full_matrix` satisfaction disappears.

Tests must never hit paid remote inference: the AI binding is mocked in the pool;
`remote: true` bindings are for `wrangler dev`, not for `vitest`.

### Service selection (v2 judgment carried forward, Workers-first, plus platform deltas)

The v2 table survives: **D1** for multi-tenant relational data, work queues-as-tables,
sessions, usage tracking (with CHECK-constrained status columns — kept as a hygiene
check); **KV** for metadata caching and rate-limit counters, never relational truth;
**R2** for artifacts, uploads, generated media; **Durable Objects** for real-time
coordination and stateful connections; **Queues** for background work; **Workflows**
decided by the dependency-chain test, not duration; **Service bindings** for
worker-to-worker; **Cron triggers** for resets, cleanup, recovery sweeps.

v3 additions the skill rewrite must encode:

- **Durable Objects are SQLite-backed now** — new DO classes declare
  `new_sqlite_classes` in the migration block; per-object relational state replaces the
  old KV-style DO storage idiom. Alarms remain the recovery-loop primitive.
- **Queues declare failure policy at bind time**: every consumer sets `max_retries` and
  a `dead_letter_queue`. A queue without a DLQ is the "silent fallback chain" the
  constitution bans, expressed as infrastructure. Deterministic hygiene check.
- **Workflows**: `WorkflowEntrypoint` imported from `cloudflare:workers`; each step
  idempotent (the engine's step-granularity guidance goes in the skill); Workflows for
  A-then-B-then-C chains, cron+queue for independent long-running work.
- **Workers AI**: binding named exactly `AI`; local dev uses the remote proxy
  (`remote: true`), tests mock it. Model choice policy stays in the settled registry
  (S-002 below).
- **Hyperdrive** enters the table for "the spec names an existing Postgres" — connection
  pooling from Workers; not a default component.
- **Rate limiting**: the native rate-limiting binding replaces hand-rolled KV counters
  for simple per-key limits; KV counters remain for windowed/custom logic.
- **Smart placement**: on (`mode: "smart"`) for profiles that are D1/backend-heavy,
  off for pure edge/asset serving. One-line hygiene note, not a gate.

### Auth/crypto/error judgment — unchanged

PBKDF2-100k via Web Crypto, constant-time comparison, the session schema, the
middleware layering (root = session/context, API = subscription/limits, handlers assume
permission), the thin service edge, the Level-4 error enrichment ladder, the billing
webhook discipline — all v2 judgment content carries forward verbatim. The middleware
skill's *placement* language updates from Pages Functions files to the `src/middleware/`
layer of the single Worker; the four-step thin-proxy contract becomes the contract for
`src/routes/*` handlers calling `src/services/*` modules.

---

## Design Decisions (continuing from v2's D1–D8)

- **D9 — Facts are computed; judgments are judged (T1 as architecture).** Three moves:
  scaffold materialization is code (D11); release-gate synthesis is code over executed
  evidence (D12/D13); deployment reporting is code over deploy/verify events (D19). The
  model's stage roles narrow to: read/plan/decide (planner), critique (architect),
  implement (engineer/designer), *specify what must be proven* (tester), and score
  (judge). Nothing else changes hands. The corollary rule for all future work: **before
  adding a judge, ask if the subject is a fact; before adding a check, ask if the
  subject is a judgment.**

- **D10 — Deterministic truth path (T2 as mechanism).** `checks/run.mjs` gains gate-set
  mode: `node checks/run.mjs gate-set <name> --run <runDir> --out <detFile>` executes a
  named list of checks (gate-set definitions live beside the rubrics), writes the
  det-results JSON **itself**, and registers the event via `stage.mjs` **itself**.
  `aggregate.mjs` likewise writes and registers its judgment file directly. Runner
  agents shrink to "execute this command, report exit code" — their words are never
  parsed. `deliver.js` reads outcomes from the files code wrote, passing only file paths
  through model context.

- **D11 — Scaffold is code; profiles are planner-chosen flags.** A deterministic
  `scripts/scaffold.mjs` materializes the target shape above from a **profile**: a set of
  composable feature flags (`d1`, `kv`, `r2`, `do`, `queues`, `workflows`, `ai`,
  `typescript`, `spa`, `custom-domain`) plus name/description. **The planner selects the
  profile as part of the judged task plan** (a new `scaffold_profile` field, gated for
  validity against the flag registry and judged for fit under the component-selection
  skill). No regex inference over source documents, ever — that is how mastra's harness
  learned product nouns. The scaffold's file manifest is recorded as
  `scaffold-manifest.json`; manifest files become **readonly surfaces** in
  `boundary.json` (builders extend the scaffold through their owned files; they do not
  edit its baseline). Re-runs never overwrite existing files.

- **D12 — Evidence is executed, and its statuses cannot lie.** A deterministic
  `scripts/evidence.mjs` runs the evidence chain (install → typecheck/tests →
  `wrangler types --check` → `wrangler deploy --dry-run` → `wrangler check startup` →
  local D1 migrations → boot `wrangler dev` on a free port → execute the probe plan →
  teardown) and appends structured results to `evidence.jsonl`. Every evidence item and
  every critical area carries exactly one of four statuses:
  `executed_pass | executed_fail | not_executed | not_applicable(reason)`.
  **There is no mechanism for inferring a status** — no keyword matching, no "a passing
  command mentioned auth." An area with no probe mapped to it is `not_executed`, visibly,
  and the gate fails closed on it. Honest gaps outrank flattering summaries; this is
  Rule 11 applied to the harness itself.

- **D13 — The tester authors the probe plan; code executes it.** New judged artifact
  `probe-plan.json` (schema in P11): a list of probes, each with `id`, `tier`, request
  shape (`method`, `path`, optional body/headers), `expect` (status, optional body/header
  assertions), the `critical_area` it evidences, and a `source_ref` quoting the
  vision/spec line it traces to. The probe-plan **rubric** judges coverage (every
  critical area and every behavior-shaped acceptance criterion is either probed or
  explicitly listed `unprobeable` with a reason) and traceability (probes quote real
  source lines — the judge reads the spec). The tester also writes the vitest suite (the
  `api` tier). The tester **no longer authors the release gate**; `evidence.mjs` +
  gate-set synthesis produce it. This keeps LLM judgment exactly where mastra deleted it
  (is the *plan of proof* sufficient?) while removing it exactly where mastra was right
  to (what did the proof *say*?).

- **D14 — Settled policy is versioned data.** New `policy/settled.json`: an array of
  entries `{id, statement, rationale, adopted, supersedes?, consumers[]}`. Initial
  entries: **S-001** Workers-first (above); **S-002** LLM routing (carried from v2:
  cheap/fast model for rule application and extraction, Claude for serious content
  judgment — re-affirmed, now amendable in one place); **S-003** PBKDF2-100k crypto
  policy; **S-004** vanilla HTML/CSS/JS frontend, no frameworks/build steps; **S-005**
  Wrangler-CLI deploys, GitHub Actions banned as a deploy path (adopted from mastra —
  it was right); **S-006** the approved font list and visual constraints. Skills, agent
  prompts, and the `settled_policy_respected` gate description all cite entries by id
  instead of restating them. Changing a settled position = adding a superseding entry —
  the fork this repo just lived through (Pages vs Workers across two repos, no
  supersession record) becomes structurally impossible to repeat silently.

- **D15 — Boundary enforcement covers the shell; scaffold files are readonly.** The
  PreToolUse hook set extends to `Bash`: deny commands whose write targets (`>`, `>>`,
  `tee`, `cp`/`mv`/`install` destinations, `sed -i`, `dd of=`) fall outside the active
  boundary; deny a blocked-command list (`rm -rf` outside the repo temp dirs,
  `git reset --hard`, `git clean`, `git checkout --`, `sudo`, piped `curl|sh`,
  recursive `chmod`/`chown`). Parsing shell is approximate — the hook denies what it can
  prove and logs what it can't, and the post-hoc `write_paths_in_boundary` check gains a
  git-status cross-check: **after each build stage, `git status --porcelain` is diffed
  against the boundary; any dirty path outside it fails the gate deterministically**,
  which catches whatever the parser missed. That cross-check, not the parser, is the
  real guarantee. `boundary.json` gains `readonly: []` (scaffold manifest paths);
  crypto-guard gains a PostToolUse full-file rescan so fragment-assembled violations are
  caught on write, not at judgment.

- **D16 — Retries are classified, small taxonomy.** A deterministic
  `scripts/classify-failure.mjs` reads the stage's event slice + det results + judgment
  and emits one of five classes, which `deliver.js` maps to a retry shape:
  `no_writes` → write-first prompt (restate surfaces, forbid exploration);
  `verification_failed` → focused-repair prompt (include the failing command output
  verbatim, forbid new surfaces); `boundary_blocked` → escalation prompt (the task's
  surfaces may be wrong — surface to orchestrator/human rather than burn retries);
  `judge_rejected` → the classic remediation bounce (unchanged);
  `infra_failure` (judge outage, tool crash) → retry without consuming the budget, once.
  Five classes, not thirteen — mastra's long tail of classes each encoded one benchmark
  incident; these five are structural.

- **D17 — Product-blindness has teeth.** New self-test in `checks/run-all.mjs`:
  `harness_blindness` scans `checks/`, `scripts/`, `workflows/`, `hooks/`, `policy/`
  (excluding `settled.json` rationale prose and fixtures) for literals matching product
  vocabulary shapes — route paths other than an allowlist (`/health`), SQL table names
  outside the engine's own artifact vocabulary, and any term absent from
  `policy/engine-vocabulary.json` that appears in a comparison against `examples/`
  vision/spec nouns. The check is deliberately approximate; it exists to make product
  bleed *loud at commit time*, with the maintaining-the-engine rule as the human
  backstop: **product knowledge enters runs as data through three doors (source docs,
  judged plans, judged probe plans) — never as engine code.**

- **D18 — Nothing ships dormant.** Every rubric, check, and config key in the repo is
  either (a) invoked by the pipeline, (b) invoked by a command, or (c) carries an
  explicit `activation` block naming the criterion for wiring it (e.g., trajectory
  rubrics: "advisory scoring in every run; promoted to gating per-rubric after 10 runs
  where advisory scores separate bounced from passed stages — see `/calibration-report`").
  A registry-sync self-test enforces the invariant (every `check.deterministic` name
  exists in `checks.mjs` — now with **zero** exceptions; every rubric is reachable from
  `deliver.js`, a command, or an activation block). The v2 phantom (`module_loads`) and
  the v2 dead config (`max_turns`) become impossible categories. `max_turns` is
  deleted or wired in P8 — not left ambient.

- **D19 — Deploys are versioned: upload → verify → promote.** The deploy stage's real
  mode uses Wrangler's versioned path: `wrangler versions upload` produces a preview URL
  that receives traffic from no one; the probe plan's `e2e` set executes against the
  preview; only on green (and, for production, only after recorded human approval) does
  `wrangler versions deploy` promote it — optionally gradually (e.g. 10% → observe →
  100%) when the profile requests it. The prior version id is recorded **before**
  promotion (from `wrangler deployments list`), making the rollback command
  (`wrangler rollback` / promote-previous) a recorded fact in the deployment report, not
  a narrated intention. Deploy modes become: `local` (default — dev-server probes only),
  `staging` (deploy to `env.staging`, probe the deployed URL), `production` (staging
  first, then versioned production promote behind approval). Mock mode is retired; local
  mode already runs real probes against a real local runtime.

- **D20 — The engine governs its own evolution.** Adopted from mastra's doctrine layer,
  scaled to this repo: (a) `docs/RUNS.md` — every end-to-end run gets a pre-entry (what
  forward-progress question is this run answering?) and a post-entry (farthest verified
  stage, failure class, cheapest next proof); (b) the **cheap-proof-first rule** — before
  re-running the pipeline to test a fix, write the fixture/self-test that proves it
  statically if one is possible; (c) the **forward-progress scoreboard** — a fix that
  moves failure earlier without moving delivery farther is not progress; (d) stop
  condition — when the tempting fix is "more prompt pressure," stop and re-sort the rule
  into a better bucket. These live in `CLAUDE.md`'s maintaining-the-engine section as
  rules with the run journal as their artifact.

---

## v3 End State — the pipeline after all phases

```
/deliver vision.md [spec.md]
  → readout (planner; topology_exception recorded iff source docs name Pages)
  → task plan + scaffold profile (planner) → plan gate-set + rubric judge → bounce/PASS
  → architect review → review rubric judge → bounce (remediation now actually injected) /
      block → planner revision → revised plan RE-GATED and RE-JUDGED → PASS
  → scaffold (CODE: scaffold.mjs materializes profile; manifest → readonly surfaces)
  → LOOP over tasks (dependency order; boundary hook incl. Bash; readonly scaffold):
      engineer/designer builds → verification command runs → gate-set (det, self-written)
      → implementation rubric judge → FAIL: classify → shaped retry (D16) → STUCK parks
      → trajectory rubric scores the stage slice (ADVISORY, recorded)
  → tester authors probe-plan.json + vitest suite → probe-plan rubric judge → bounce/PASS
  → evidence engine (CODE: evidence.mjs executes tiers smoke→api→e2e[→full_matrix])
  → release gate SYNTHESIZED from evidence (CODE) → gate-set (fails closed on
      not_executed critical areas) → decision
  → deploy (mode-dependent): local probes verified | staging deploy + probes |
      versions upload → preview probes → HUMAN APPROVAL → promote → post-promote probes,
      prior-version rollback recorded
  → deployment report SYNTHESIZED (CODE) → deploy gate-set → final status
```

The model appears exactly where judgment lives; every fact in the run was computed,
executed, or synthesized by code; every deterministic result reached its gate without
passing through a model; and the run is reconstructable from `.delivery/` alone —
including *why* every verified claim is believed (evidence line → probe → source quote).

---

## Phases (continuing from v2's P1–P6)

Ordered so judgment-content changes land first (cheap, unblock everything), mechanism
integrity second, new machinery third, and meta-layer last. Each phase is independently
valuable; none requires the next.

### P7 — Settled-policy registry + Workers-first re-encoding (difficulty: low · impact: highest per unit effort)

The S-001 supersession, propagated everywhere, plus the registry that prevents the next
silent fork.

- **Deliverables**
  - `policy/settled.json` with S-001…S-006 (shapes per D14) and a schema for entries.
  - `skills/select-cloudflare-components/SKILL.md` rewritten Workers-first per the
    Target Shape section: service table updates (SQLite DOs, queue DLQ policy,
    rate-limiting binding, Hyperdrive row, smart placement note), the dependency-chain
    test kept verbatim, Pages relegated to an explicit-exception appendix.
  - `policy/boundaries.json` — new canonical layout globs (engineer: `src/**`,
    `migrations/**`, `wrangler.jsonc`, `package.json`, `tests/**`; designer:
    `public/**`); `readonly` key added (empty until P10 populates it per-run).
  - `agents/planner.md`, `agents/architect.md`, `agents/engineer.md` — topology language
    updated; planner's decision framework cites S-001 by id; middleware/thin-proxy
    placement language moved from Pages files to `src/middleware/` + `src/routes/` +
    `src/services/`.
  - `rubrics/task-plan.rubric.json` — `settled_policy_respected` gate description
    re-anchored to `policy/settled.json` ids; a new deterministic gate
    `topology_matches_policy` (plan's `scaffold_profile` implies Workers unless a
    `topology_exception` artifact with a source quote exists).
  - `templates/constitution.md` — one added working agreement: settled policy lives in
    `policy/settled.json`; cite ids, don't restate.
  - Affected skills touched only where they name Pages Functions file paths
    (`enforce-middleware-layers`, `enforce-thin-proxy` reference layout, not semantics).
- **Acceptance**: no file outside `policy/settled.json`'s S-001 rationale and the skill's
  exception appendix recommends Pages; grep for `functions/api` in policy/agents/rubrics
  returns nothing; `checks/run-all.mjs` still green; `/rubric-regression` re-run on the
  touched rubric (its exemplars updated to Workers shapes) reports TRUSTED.
- **Owned surfaces**: `policy/`, `skills/select-cloudflare-components/`, `agents/`,
  `rubrics/task-plan.rubric.json`, `templates/constitution.md`.
- **Depends on**: none.

### P8 — Deterministic truth path + judgment-loop repairs (difficulty: medium · impact: highest integrity)

T2 made real; the known v2 loop bugs fixed.

- **Deliverables**
  - `checks/run.mjs` gate-set mode per D10; gate-set definitions
    (`checks/gate-sets.json`) naming the checks + gate-id mappings per stage (this
    replaces the inline `detCommands` arrays in `deliver.js`).
  - `scripts/aggregate.mjs` writes its judgment file and registers via `stage.mjs`
    directly (no shell-redirect-by-agent, no transcription).
  - `workflows/deliver.js` updated: runner agents launch `run.mjs gate-set`/`aggregate`
    and report exit status only; all gate/judgment data flows file-to-file.
  - Loop repairs: review-report FAIL now injects the judgment's remediation into the
    architect re-run; a planner revision after an architect block re-runs the plan
    gate-set **and** the task-plan judge before review resumes; judge-malfunction
    handling from `commands/judge.md` (respawn once, then report — never improvise)
    adopted into the pipeline; `infra_failure` retries don't consume the budget (D16
    partial, the rest lands in P13).
  - Per-rubric `threshold` field honored by `aggregate.mjs` (default 0.7 when absent);
    initial values set deliberately (release-gate and deployment rubrics stricter than
    plan rubrics).
  - `max_turns` removed from `boundaries.json` (or wired — implementer picks one and
    documents it; ambient config is the failure).
- **Acceptance**: a full fixture run produces byte-identical det/judgment files when the
  runner agents' text output is randomized (proving no model words are load-bearing);
  the two repaired bounce paths each demonstrated by a forced-failure fixture run;
  `aggregate.test.mjs` extended for per-rubric thresholds; registry-sync self-test
  (D18) added to `run-all.mjs` and green.
- **Owned surfaces**: `checks/`, `scripts/aggregate.mjs`, `workflows/deliver.js`,
  `rubrics/*` (threshold fields), `scripts/stage.mjs` (register subcommands).
- **Depends on**: P7 (gate-set contents reference the updated gates).

### P9 — Boundary v2 + designer teeth (difficulty: medium · impact: high)

Close the shell bypass; give the strictest prose its checks.

- **Deliverables**
  - `scripts/boundary-check.mjs` extended to `Bash` per D15 (write-target parsing +
    blocked-command list); hook matcher updated in `hooks/hooks.json`.
  - New deterministic check `worktree_clean_outside_boundary`: `git status --porcelain`
    diffed against the active boundary at stage end — added to the build gate-set. (This
    is the real guarantee; the parser is the early warning.)
  - `scripts/crypto-guard.mjs` gains PostToolUse full-file rescan mode.
  - New deterministic check `no_banned_ui_patterns` over designer-owned files:
    `linear-gradient`/`radial-gradient`, `alert(`/`confirm(`/`prompt(`, non-approved
    font families in CSS/`@import`/font `<link>`s (allowlist from settled entry S-006),
    framework imports in `public/`. Added to the build gate-set for designer-owned
    tasks. The visual system finally has the teeth it always deserved — it was the most
    regexable judgment in the repo and the least enforced, in both repos.
  - `boundary.json` `readonly` enforcement in the hook (deny writes to readonly paths
    with the escalation message).
- **Acceptance**: fixture runs prove `bash -c 'cat > public/x'` is denied for the
  engineer, a `tee` outside boundary is denied, an unparseable-but-dirty write is caught
  by `worktree_clean_outside_boundary`, a gradient in designer CSS fails the gate, and
  interactive (no-manifest) use remains fully inert; `run-all.mjs` fixtures cover each
  new check both directions.
- **Owned surfaces**: `scripts/boundary-check.mjs`, `scripts/crypto-guard.mjs`,
  `hooks/hooks.json`, `checks/`, `policy/settled.json` (S-006 consumer note).
- **Depends on**: P8 (gate-sets exist to receive the new checks).

### P10 — Scaffold engine (difficulty: medium · impact: high)

D11: the model stops hand-writing Worker baselines.

- **Deliverables**
  - `scripts/scaffold.mjs` + `scaffold/profiles/` fragments materializing the Target
    Shape: `wrangler.jsonc` per contract (compat date stamped, env mirrors generated),
    `package.json` with the scripts contract, entrypoint with `/health`, `public/`
    shell, vitest Workers-pool config + the smoke test, `.dev.vars` stub, `.gitignore`,
    `migrations/` when `d1`; each feature flag adds its binding to all three env scopes
    and its runtime stub (queue consumer with DLQ config, DO class with
    `new_sqlite_classes` migration, WorkflowEntrypoint import, `AI` binding).
  - `schemas/task-plan.schema.json` + planner prompt: `scaffold_profile` field (flags +
    name); new deterministic plan gate `scaffold_profile_valid`.
  - `deliver.js`: scaffold stage after Review; writes `scaffold-manifest.json`
    (registered artifact); manifest paths become `boundary.json.readonly` for all
    subsequent build stages; `overwrite: never`.
  - New hygiene checks (build + evidence gate-sets): `wrangler_config_hygiene`
    (schema-parse the config; env mirror completeness; compat-date staleness warning;
    observability block present; assets binding sane) and `queue_failure_policy` /
    `do_migration_declared` when profiled.
  - `/setup-delivery` optionally invokes the scaffold for greenfield repos.
- **Acceptance**: for each profile flag alone and one kitchen-sink combination, the
  materialized project passes `wrangler deploy --dry-run` and its own `npm test` smoke
  tier with **zero model involvement**; re-running scaffold on a dirty repo changes
  nothing; hygiene checks pass on scaffold output and fail on seeded mutations (missing
  staging mirror, commented AI binding, queue without DLQ).
- **Owned surfaces**: `scripts/scaffold.mjs`, `scaffold/`, `schemas/task-plan.schema.json`,
  `checks/`, `workflows/deliver.js`, `agents/planner.md`, `commands/setup-delivery.md`.
- **Depends on**: P7 (target shape settled), P9 (readonly enforcement exists).

### P11 — Evidence engine + synthesized release gate (difficulty: high · impact: the payoff)

D12 + D13: the center of v3.

- **Deliverables**
  - `schemas/probe-plan.schema.json` + `rubrics/probe-plan.rubric.json` (coverage +
    traceability dimensions per D13; deterministic gates: schema-valid, every
    critical_area mapped-or-unprobeable, source_refs resolve to real lines — a
    deterministic string check against the source docs).
  - `agents/tester.md` rewritten: authors probe plan + vitest suite; no longer authors
    the gate. Coverage requirements (auth flows, limit enforcement, the Level-4 error
    shape on at least one error path, tenant isolation when profiled) move into the
    probe-plan rubric's coverage dimension.
  - `scripts/evidence.mjs` per D12: the chain, structured `evidence.jsonl`, four honest
    statuses, `wrangler dev` lifecycle management (free port, readiness wait, teardown),
    per-command timeouts, `--tier` selection so smoke/api can run cheaply mid-build.
  - `scripts/synthesize-gate.mjs`: pure function `evidence.jsonl + probe-plan.json →
    release-gate.json` (tiers from executed tiers; critical areas from probe statuses;
    blockers from `executed_fail` + `not_executed`-critical; decision fails closed).
  - `deliver.js` Test stage rewired: tester (judged) → evidence (code) → synthesis
    (code) → release gate-set (existing checks + new `evidence_statuses_honest`: no
    status in the gate lacks a corresponding evidence line — the anti-laundering check,
    pointed at ourselves).
  - **`module_loads` becomes real**: the scaffold's smoke test executed by
    `evidence.mjs` — the implementation rubric's gate mapping updated to the genuine
    check; phantom retired (closes the last registry-sync exception).
- **Acceptance**: on the `examples/` fixture, the full chain runs against real Wrangler
  locally: every critical area's status traces to an evidence line that traces to a
  probe that quotes a source line; deleting one probe flips its area to `not_executed`
  and the gate to fail — with no model in the loop from evidence to decision; a seeded
  `executed_fail` produces a blocker verbatim from the command output; synthesis is
  covered by pure-function unit fixtures in `run-all.mjs`.
- **Owned surfaces**: `scripts/evidence.mjs`, `scripts/synthesize-gate.mjs`, `schemas/`,
  `rubrics/probe-plan.rubric.json`, `rubrics/release-gate.rubric.json` (retired from
  live judging; kept only if regression-valuable, else deleted per D18), `agents/tester.md`,
  `workflows/deliver.js`, `checks/`.
- **Depends on**: P8 (truth path), P10 (scaffold provides smoke test + config the chain
  exercises).

### P12 — Versioned deploy (difficulty: medium · impact: high)

D19: upload → verify → approve → promote → verify, with rollback as a recorded fact.

- **Deliverables**
  - `deliver.js` deploy stage: modes `local` (evidence-engine dev probes — largely
    already proven by P11), `staging` (`wrangler deploy --env staging`, probe the
    deployed URL, D1 migrations applied to staging), `production` (staging first, then
    `versions upload` → preview-URL probe execution → **human approval recorded as an
    event with approver identity** → `versions deploy` → post-promote probe re-run;
    prior version id captured pre-promote).
  - `scripts/deploy-report.mjs`: deployment-report.json synthesized from deploy/verify
    events + evidence (migrations applied, binding deltas, rollback command with real
    version id, irreversible-migration caveats surfaced from migration filenames/flags).
  - Deploy gate-set: existing trajectory checks + `rollback_recorded` (report contains a
    prior version id and a non-empty rollback command) + `post_promote_verified`.
  - `deployment-report` rubric retired from live judging or deleted (D18) — the report
    is now a fact artifact.
- **Acceptance**: staging mode demonstrated end-to-end on the fixture against a real
  Cloudflare account (documented as requiring credentials; skippable in CI with status
  `not_executed`, honestly); production path demonstrated to the approval gate in a
  dry configuration; a promote without prior-version capture is impossible by
  construction (the script refuses).
- **Owned surfaces**: `workflows/deliver.js`, `scripts/deploy-report.mjs`,
  `scripts/evidence.mjs` (deployed-URL probe mode), `checks/`, `agents/deployer.md`
  (narrowed to approval liaison + anomaly narration, or retired per D18 — implementer
  decides against the registry-sync invariant).
- **Depends on**: P11.

### P13 — Classified retries + trajectory advisory (difficulty: medium · impact: medium-high)

D16 + D18's activation machinery.

- **Deliverables**
  - `scripts/classify-failure.mjs` (five classes per D16) + `deliver.js` retry shapes
    (four prompt templates + the non-budget infra retry).
  - Trajectory advisory wiring: after each stage, the stage slice is judged against its
    trajectory rubric with `gating: false`; judgments recorded alongside artifact
    judgments; **no bounce ever triggered by an advisory score**.
  - `commands/calibration-report.md` (`/calibration-report`): reads all runs'
    judgments + outcomes from `.delivery/` histories, reports per-rubric separation
    (advisory scores on stages that later bounced/parked vs. passed), and states
    per-rubric whether the D18 promotion criterion is met.
  - `activation` blocks added to the six trajectory rubrics.
- **Acceptance**: forced fixture failures of each class produce the matching retry
  shape (asserted from the events + prompts recorded); a full run emits six advisory
  trajectory judgments with zero effect on control flow; `/calibration-report` renders
  on ≥2 recorded runs.
- **Owned surfaces**: `scripts/classify-failure.mjs`, `workflows/deliver.js`,
  `commands/calibration-report.md`, `rubrics/trajectory/*`.
- **Depends on**: P8 (classification reads det results), P11 (verification_failed class
  reads evidence output).

### P14 — Engine doctrine + product-blindness tripwire (difficulty: low · impact: compounding)

D17 + D20: protect the engine from its own future.

- **Deliverables**
  - `harness_blindness` self-test per D17 + `policy/engine-vocabulary.json`;
    wired into `run-all.mjs` (commit gate).
  - `docs/RUNS.md` with the pre/post entry template; `CLAUDE.md`
    maintaining-the-engine section gains the run-journal rule, cheap-proof-first rule,
    forward-progress scoreboard, and the re-sort stop condition (D20) — each one
    sentence plus its artifact.
  - Exemplar-growth path: `/promote-exemplar <judgment-file>` copies a real run's
    judged artifact (+ human verdict) into the owning rubric's exemplars, then requires
    `/rubric-regression` — the calibration set compounds with use instead of staying
    frozen at authoring time.
  - README updated for v3 (pipeline diagram, the three theses, the sorting principle
    unchanged).
- **Acceptance**: seeding a route literal into `scripts/` fails `run-all.mjs`; a
  promoted exemplar round-trips through regression; README describes the pipeline the
  code actually runs (checked against `deliver.js` phases by hand — and noted as the
  drift class mastra fell to).
- **Owned surfaces**: `checks/`, `policy/engine-vocabulary.json`, `docs/RUNS.md`,
  `CLAUDE.md`, `commands/promote-exemplar.md`, `README.md`.
- **Depends on**: everything before it (it documents and defends the result).

---

## Artifact & Schema Deltas (consolidated)

| Artifact | Change |
|---|---|
| `task-plan.json` | + `scaffold_profile` (flags, name); topology gate |
| `readout.json` | + optional `topology_exception {quote, source, line}` |
| `scaffold-manifest.json` | **new** (code-authored): files materialized, profile, stamps |
| `probe-plan.json` | **new** (tester-authored, judged): probes with tier/expect/critical_area/source_ref |
| `evidence.jsonl` | **new** (code-authored): executed evidence stream, four statuses |
| `release-gate.json` | now **synthesized by code**; tiers = executed evidence classes |
| `deployment-report.json` | now **synthesized by code**; rollback = recorded version id |
| `boundary.json` | + `readonly: []` |
| `policy/settled.json` | **new**: S-001…S-006 with supersession semantics |
| `checks/gate-sets.json` | **new**: per-stage deterministic gate lists (moves out of deliver.js) |

Rubric census after v3 (D18-clean): **live-judged** — task-plan, review-report,
implementation, probe-plan (4). **Advisory with activation criteria** — 6 trajectory.
**Retired or regression-only** — release-gate, deployment-report, design-spec, handoff
(each explicitly retired with a note, or deleted; none left ambient).

---

## What v3 Deliberately Does Not Take From mastra

- **In-process runtime, dual storage, Studio observability.** `.delivery/` files + git
  remain the only state. The portability and legibility of the file layer is this repo's
  moat; a database mirror is surface area without a consumer here.
- **Thirteen failure classes, salvage heuristics, read budgets, per-call watchdogs.**
  Five classes and the harness's own timeouts suffice until run journals prove
  otherwise; every one of mastra's extra classes encoded one benchmark incident.
- **Regex inference of topology/features from source documents.** The planner decides;
  the human's documents declare; gates verify consistency. Inference is how product
  nouns colonized the harness.
- **Non-actionable-judgment completion policy.** Rather than teach the aggregator to
  excuse irrelevant dimensions, v3 leans on `applies_when`/`not_scored` renormalization,
  which the aggregation already handles. If run journals show good work parking STUCK on
  inapplicable dimensions, revisit with evidence.
- **Deleting LLM judgment from the test stage.** mastra removed the judge where it
  removed the model; v3 keeps a judge on the *probe plan* because proof-sufficiency is a
  judgment. Facts got the code; the judgment kept its judge.

## Non-Goals (v2's list still applies, plus)

- No browser-automation E2E harness in v3. The `e2e` tier is HTTP probes against real
  runtimes; DOM-level testing is a future settled-policy decision, not an implied gap.
- No multi-worker/monorepo topologies (service-binding meshes are planned-for in the
  skill, scaffolded singly).
- No CI integration for target repos (the engine runs the checks; GitHub Actions stays
  banned as a deploy path per S-005).

## Risks

- **Shell-parse false negatives (P9)**: mitigated by design — the git-status cross-check
  is the guarantee; the parser is best-effort. False *positives* are the real ergonomic
  risk; the deny message must always name the escalation path.
- **Evidence-chain flakiness (P11)**: `wrangler dev` boot and port management are the
  moving parts; the engine must distinguish `infra_failure` (retry, don't burn budget)
  from `executed_fail` (real). Timeouts and readiness probes are specified, and the
  honest `not_executed` status is the safe degradation everywhere.
- **Cloudflare CLI drift**: Wrangler flags/behavior move fast. Version-pin wrangler in
  the scaffold's devDependencies; `wrangler_config_hygiene` checks the schema shipped
  with the pinned version, not memory. The run journal is the tripwire for drift.
- **Scope**: P10+P11 are the heavy phases. Both are fixture-testable without paid model
  runs (D20's cheap-proof-first rule applies to building the engine, not just using it).
- **The spec's own staleness**: this document restates settled policy in prose for
  readability; `policy/settled.json` is authoritative the moment P7 lands. If they
  disagree, the registry wins — that is the lesson of S-001.

## Open Questions for Chris (decision-shaped, none blocking P7–P9)

1. **Gradual production rollouts** (10% → 100% via versions) — default for production
   mode, or profile flag only? (Spec assumes flag-only.)
2. **S-002 LLM routing** — carried forward as-written from v2 (cheap/fast for rule
   application, Claude for serious content). Re-affirm or amend while the registry is
   being created?
3. **Deployer agent** — narrow to approval-liaison, or retire the role entirely and let
   the orchestrator + human own the deploy conversation? (Spec leans retire; D18 forbids
   keeping it ambient.)
4. **`staging` as the default deploy mode** once P12 is trusted, promoting `local` to
   the fast path? (Spec keeps `local` default through v3.)
