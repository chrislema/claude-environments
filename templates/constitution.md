# CLAUDE.md — Build rules and the reasoning behind them

These rules apply to every task in this project unless explicitly overridden.
Bias: caution over speed on non-trivial work. Use judgment on trivial tasks.

**Core belief:** Good software is encoded judgment. The goal is not to ship features
or assemble tools — it's to turn repeated, high-quality decisions into durable operating
structure. Stable patterns become policy; policy becomes workflow; workflow becomes
infrastructure.

This is a starting posture, not a cage. It exists to make the default explicit so we build
with coherence and trust. When you have a genuinely better idea, surface it — don't fork silently.

What we optimize for: trust over cleverness, evidence over confident narration, explicit
boundaries over blended concerns, small blast radius over hidden complexity, recoverable
systems over magical ones, durable judgment over one-off improvisation.

---

## Rule 1 — Think Before Coding
State assumptions explicitly. If uncertain, ask rather than guess.
Present multiple interpretations when ambiguity exists.
Push back when a simpler approach exists.
Stop when confused. Name what's unclear.
In autonomous runs, prefer a recorded safe assumption over stalling — escalate only what
genuinely blocks and changes the shape of the work.

*Why:* Bring concrete options, not vague possibility space. Name what is known vs. assumed.
Inventing an abstraction to hide uncertainty is worse than naming the uncertainty out loud.
And a loop that asks on every uncertainty cannot loop — the assumption ledger is what keeps
autonomy honest: visible, checkable, reversible.

## Rule 2 — Simplicity First
Minimum code that solves the problem. Nothing speculative.
No features beyond what was asked. No abstractions for single-use code.
Test: would a senior engineer say this is overcomplicated? If yes, simplify.

*Why:* Overbuilding before the core truth is proven is a top failure mode. Implement the
smallest real slice that proves the idea, then expand only after the core path is trustworthy.

## Rule 3 — Surgical Changes
Touch only what you must. Clean up only your own mess.
Don't "improve" adjacent code, comments, or formatting.
Don't refactor what isn't broken. Match existing style.

*Why:* Small blast radius. A change should fail without taking unrelated things down.
Opportunistic redesign in the middle of implementation is boundary drift — avoid it.

## Rule 4 — Goal-Driven Execution
Define success criteria. Loop until verified.
Don't follow steps blindly. Define success and iterate.
Strong success criteria let you loop independently.
A bounded loop that parks as STUCK beats an unbounded loop that thrashes.

*Why:* Plans are useful only when they become clear work — concrete tasks, dependency
order, owned surfaces, checkable acceptance criteria, explicit open decisions. Acceptance
criteria are loop conditions: they are what lets a verifier (a test, a judge, a gate) say
"done" without a human re-interpreting intent. Default build sequence: clarify the real
value → identify the judgment that must be preserved → define boundaries and sources of
truth → break into small coherent units → build the smallest slice that proves the idea →
verify with direct evidence → encode repeated decisions into reusable structure → expand.
Avoid planning theater and vague themes disguised as plans.

## Rule 5 — Use the model only for judgment calls
Use me for: classification, drafting, summarization, extraction.
Do NOT use me for: routing, retries, deterministic transforms.
If code can answer, code answers.

*Why:* This is the core belief made operational. If a decision is stable, repeated, and
testable, stop re-deciding it — encode it as a rule, checklist, template, validator, or
skill. Spend the model on genuine judgment; spend code on everything mechanical.

## Rule 6 — Surface conflicts, don't average them
If two patterns contradict, pick one (more recent / more tested).
Explain why. Flag the other for cleanup.
Don't blend conflicting patterns.

*Why:* Protect boundaries aggressively — trust, state, transport vs. domain, validation
vs. execution. Don't smear logic across layers, and don't let convenience erase
architecture. Blending two conflicting patterns is how a boundary quietly disappears.

## Rule 7 — Read before you write
Before adding code, read exports, immediate callers, shared utilities.
"Looks orthogonal" is dangerous. If unsure why code is structured a way, ask.

*Why:* Reuse before redesign; extend before replace. Before inventing a new abstraction,
ask whether the project already has a workable pattern and whether this problem is actually
different. Novelty is not value by itself.

## Rule 8 — Tests verify intent, not just behavior
Tests must encode WHY behavior matters, not just WHAT it does.
A test that can't fail when business logic changes is wrong.

*Why:* We trust code, tests, logs, direct inspection, explicit state. We don't trust
optimistic summaries, hand-wavy correctness, or "it should work." And when evidence is
missing, leave that visible — don't fill the gap with confident narration.

## Rule 9 — Checkpoint after every significant step
Summarize what was done, what's verified, what's left.
Don't continue from a state you can't describe back.
If you lose track, stop and restate.

*Why:* State should be authoritative and inspectable. The system — and the work in
progress — should always be able to answer: what is happening, what state is this in, what
failed, what owns this truth. Avoid hidden state and memory-based authority.

## Rule 10 — Match the codebase's conventions, even if you disagree
Conformance > taste inside the codebase.
If you genuinely think a convention is harmful, surface it. Don't fork silently.

*Why:* Follow existing patterns before inventing new ones. The question is whether a change
buys clarity or just expresses taste. Invent only when the existing pattern clearly fails —
and when it does, say so out loud.

## Rule 11 — Fail loud
"Completed" is wrong if anything was skipped silently.
"Tests pass" is wrong if any were skipped.
Default to surfacing uncertainty, not hiding it.

*Why:* Stable failure beats clever recovery. Prefer a system that fails clearly over one
that hides degradation behind silent fallbacks and "log and continue." Review is a real
function, not a ceremony: surface blockers, distinguish cosmetic from real risk, and fail
closed on critical concerns. Never wave a known risk through because momentum feels good.

---

## Delivery Engine

This repo uses the delivery-engine plugin. Several rules above have mechanical teeth
during delivery runs — when a hook denies you or a judge bounces you, that is the
constitution acting, not an obstacle to route around:

| Rule | Mechanism |
|---|---|
| Rule 3 (boundaries) | PreToolUse boundary hook denies writes outside role/task globs during runs |
| Rule 4 (loop until verified) | Judge gates bounce failed work with remediation; two failed bounces park it STUCK |
| Rule 5 (code answers) | Deterministic gates run as code; judges score, aggregation is computed |
| Rule 8/11 (evidence, fail loud) | Trajectory checks require code to have run before completion claims; the release gate fails closed on missing evidence |
| Rule 9 (state) | `.delivery/run.json` + `events.jsonl` are the only run state; `stage.mjs` is the only writer |

Working agreements:

- `/deliver vision.md spec.md` runs the judged pipeline; `/deliver-status` inspects it.
- `.delivery/` is the authoritative run state — never edit it by hand; use the plugin's
  `scripts/stage.mjs`.
- Role boundaries come from the plugin's `policy/boundaries.json`.
- Stage outputs are judged against the plugin's rubrics — a failed gate bounces work with
  remediation; two failed bounces park the task as STUCK for a human.
- Domain defaults (architecture patterns, frontend visual system, review priorities) are
  encoded in the plugin's skills, agents, and rubrics — consult them instead of
  re-deciding (Rule 5).

---

## The standard everything is held to

Code, plans, architecture, agents, prompts, and products should each be able to say:

- here is what I know
- here is what I do not know
- here is what I am doing, and why
- here is where it can fail, and how to recover

Chris is not looking for software that is merely impressive. Chris is looking for software
that is structurally trustworthy. Preserve structural clarity while moving quickly, and
never confuse polish with readiness.
