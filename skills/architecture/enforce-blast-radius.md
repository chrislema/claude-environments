---
name: enforce-blast-radius
description: Evaluates components, tasks, and modules for size and coupling, then identifies what must be split to maintain small blast radius.
trigger: When planning or reviewing architecture, when a task feels too broad, when a module absorbs unrelated concerns, or when failures are hard to localize.
role: architect, planner
---

## Purpose

Inspects components, tasks, and architectural boundaries for excessive scope, coupling, or complexity. Produces concrete split recommendations so that every unit can be explained simply, tested in isolation, and fails without taking down unrelated functionality.

## Procedure

1. Identify the components, modules, or tasks under review. List each one by name and file path.
2. Apply the three-question test to each component:
   - Can you explain what it does in one sentence?
   - If it fails, will it take down unrelated functionality?
   - Can you test it in isolation?
   Flag any component that answers "no" to any question.
3. Measure each component against the complexity budget. Flag anything that exceeds the thresholds.
4. Check for coupling violations: deployment coupling (unrelated features that must deploy together), domain coupling (mixed auth + validation + business logic + persistence), and UI/logic coupling (presentation interleaved with domain rules).
5. For each flagged component, name the boundary that should exist and describe the split — what coherent units it should decompose into.
6. Restate the architecture or task plan in terms of the smaller units, confirming each passes the three-question test.

## Reference

### Three-Question Test

Ask these about any component:
1. Can you explain what it does in one sentence?
2. If it fails, will it take down unrelated functionality?
3. Can you test it in isolation?

If "no" to any of these, the component is too large.

### Complexity Budget

| Scope | Threshold |
|-------|-----------|
| Function | < 50 lines |
| Class/Module | < 200 lines |
| File | < 500 lines |
| Service | < 2000 lines |

If a component exceeds these, decompose it. The system can be complex — the parts should not be.

### Guiding Principles

- Favor one coherent job per component or task.
- Split work when it is too broad to explain simply.
- Avoid coupling deployment, domain logic, and UI concerns without a clear reason.
- Prefer isolated changes that can be reviewed and tested directly.
- Complexity belongs in composition, not inside components.

### Anti-Patterns

- **God function**: 500 lines of mixed auth + validation + business logic + persistence + error handling. Split into five focused functions composed together.
- **Hidden complexity**: A function named "simple" that contains 300 lines of branching logic.
- **Coupled deployment**: A change to billing requires redeploying the entire UI because they share a module.

## Output

Produce the following:

- A list of flagged components with the specific violation (failed question, exceeded budget, or coupling type).
- For each flagged component, the named boundary that should exist and the concrete split recommendation.
- A restated architecture or task plan in smaller coherent units, with complexity estimates against the budget.
