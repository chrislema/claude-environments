# Chris Build Philosophy

## Purpose

This document captures the default software-building philosophy behind this project. It is not meant to freeze thinking or prevent better ideas. It exists to make the starting posture explicit so the team can build with coherence, trust, and speed.

## Core Belief

Good software is encoded judgment.

The goal is not just to ship features, write code, or assemble tools. The goal is to turn repeated, high-quality decisions into durable operating structure.

That means:
- stable patterns should become policy
- policy should become reusable workflow
- workflow should become infrastructure

## What We Optimize For

We prefer:
- trust over cleverness
- evidence over confident narration
- explicit boundaries over blended concerns
- small blast radius over large hidden complexity
- recoverable systems over magical systems
- durable judgment over one-off improvisation

## Working Principles

### 1. Policy before improvisation
If a decision is stable, repeated, and testable, stop re-deciding it.
Encode it.

Do not waste energy on recurring judgment calls that can become:
- a rule
- a checklist
- a template
- a validator
- a skill
- a standard operating pattern

### 2. Stable failure beats clever recovery
Prefer a system that fails clearly over one that appears resilient by hiding degradation.

We want:
- visible failure states
- explicit diagnostics
- clear remediation paths
- honest uncertainty

We do not want:
- silent fallback chains
- hidden degradation
- "log and continue" behavior on critical paths
- systems that pretend they know more than they do

### 3. Small blast radius
Build small coherent units.

A component, task, or module should ideally:
- do one coherent job
- be explainable in one sentence
- fail without taking unrelated things down
- be testable in isolation

Complexity should live in composition, not inside giant components.

### 4. Explicit ownership
Every task should have:
- a clear deliverable
- known surfaces or files it touches
- named dependencies
- acceptance criteria

Avoid vague work.
Avoid boundary drift.
Avoid opportunistic redesign in the middle of implementation.

### 5. Real evidence over confidence
We trust:
- code
- tests
- logs
- direct inspection
- explicit state

We do not trust:
- optimistic summaries
- hand-wavy correctness
- "it should work"
- unverified assumptions presented as facts

If evidence is missing, leave that visible.

### 6. Boundaries matter
Protect system boundaries aggressively.

Common boundaries include:
- trust boundaries
- state boundaries
- transport vs domain logic
- middleware vs business logic
- UI vs operational logic
- validation vs execution

Do not smear logic across layers.
Do not let convenience erase architecture.

### 7. State should be authoritative and inspectable
The system should make it easy to answer:
- what is happening?
- what state is this in?
- what failed?
- what owns this truth?

Prefer:
- one source of truth
- explicit lifecycle states
- queryable status
- clear stuck/failed conditions

Avoid hidden state, duplicated truth, and memory-based authority.

### 8. Follow existing patterns before inventing new ones
Novelty is not value by itself.

Before inventing a new abstraction, ask:
- does the project already have a workable pattern?
- is this problem actually different?
- is the new abstraction buying clarity, or just expressing taste?

Reuse before redesign.
Extend before replace.
Invent only when the existing pattern clearly fails.

### 9. Planning should become executable quickly
Plans are useful only if they become clear work.

A good plan has:
- concrete tasks
- dependency order
- owned surfaces
- checkable acceptance criteria
- explicit open decisions

Avoid planning theater.
Avoid vague themes disguised as plans.

### 10. Review is a real function, not a ceremonial step
Review exists to protect quality, trust, and release integrity.

Good review:
- surfaces blockers clearly
- distinguishes cosmetic issues from real risks
- fails closed on critical concerns
- demands evidence on important paths

Do not wave known risks through because the momentum feels good.

## Preferred Build Pattern

When building a serious system, default to this sequence:

1. Clarify the core problem and the actual value
2. Identify the key judgment that must be preserved
3. Define the boundaries and sources of truth
4. Break the work into small coherent units
5. Implement the smallest real slice that proves the idea
6. Verify with direct evidence
7. Encode repeated decisions into reusable structure
8. Expand only after the core path is trustworthy

## Anti-Patterns

Watch for these failure modes:
- overbuilding before the core truth is proven
- casually redesigning while implementing
- blending multiple concerns into one layer
- inventing abstractions to hide uncertainty
- relying on fallback behavior instead of fixing root issues
- using confidence as a substitute for evidence
- making components too large to explain simply
- allowing critical behavior to remain uninspectable

## How To Work With Chris

When collaborating on software:
- bring concrete options, not vague possibility space
- name tradeoffs explicitly
- identify what is known vs assumed
- propose the smallest coherent change first
- preserve structural clarity while moving quickly
- challenge hand-wavy reasoning
- do not confuse polish with readiness

Chris is not looking for software that is merely impressive.
Chris is looking for software that is structurally trustworthy.

## Final Standard

The system should be able to say:
- here is what I know
- here is what I do not know
- here is what I am doing
- here is why
- here is where it can fail
- here is how to recover

That standard applies to code, plans, architecture, agents, prompts, workflows, and products.
