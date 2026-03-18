---
name: decompose-tasks
description: Breaks a product document or broad request into concrete, dependency-ordered implementation tasks with acceptance criteria.
trigger: When turning product documents into implementation work, refining a broad request, or repairing a weak plan.
role: planner
---

## Purpose

Analyzes a product document, feature request, or existing plan and produces a set of concrete, reviewable implementation tasks with explicit dependencies, ownership, and acceptance criteria.

## Procedure

1. Read the source material (product document, request, or existing plan) and identify every distinct deliverable implied by the work.
2. For each deliverable, determine the smallest coherent task boundary — a unit that can be implemented, reviewed, and accepted independently.
3. Assign an owner role to each task based on the skill required (engineer, designer, tester, deployer, etc.).
4. Identify hard dependencies between tasks. Make each dependency explicit by task ID. Flag any circular or ambiguous dependencies for resolution.
5. Write acceptance criteria for each task that can be checked by inspection, test, or demonstration — not by subjective judgment.
6. Name the files or surfaces each task intends to change. If the scope is unclear, note that explicitly rather than leaving it implicit.
7. Review the full task list for gaps: missing integration tasks, missing test tasks, unclear handoff points, or vague deliverables. Tighten or split as needed.
8. If genuine ambiguity blocks planning (not just uncertainty that can be resolved by a reasonable assumption), escalate it as a blocking question — but only then.

## Reference

### What makes a good task

- **Concrete deliverable** over vague work theme. "Implement login endpoint returning JWT" not "Work on authentication."
- **Coherent boundary** — the task touches one concern and can be reviewed without understanding unrelated work.
- **Checkable acceptance criteria** — a reviewer can verify pass/fail without re-interpreting intent.
- **Explicit dependencies** — if task B requires task A's output, say so by ID.
- **Owned files or surfaces** — naming what changes reduces drift and makes review scoping possible.

### Anti-patterns to flag

- Tasks that say "set up" or "work on" without naming a deliverable.
- Acceptance criteria that restate the task title ("done when login works").
- Hidden dependencies discovered only at implementation time.
- Tasks too large to review in a single pass — split them.
- Tasks with no owner role assigned.

### When to split vs. keep together

- Split when a task touches multiple layers (frontend + backend + storage) and each layer is independently testable.
- Keep together when splitting would create artificial handoff overhead with no review benefit.

## Output

Produce a task list where each task includes:

- **Task ID** — short, sequential identifier (e.g., T1, T2, T3)
- **Owner role** — the role responsible for delivery
- **Deliverable** — one sentence naming the concrete output
- **Dependencies** — list of task IDs this task depends on, or "none"
- **Acceptance criteria** — checkable conditions for completion
- **Owned files or surfaces** — files, endpoints, components, or UI surfaces this task will change (when known)
