# Skill: Small Blast Radius

## Use When

- planning or reviewing architecture
- a task feels too broad
- a module is absorbing unrelated concerns
- failures are hard to localize

## Guidance

- favor one coherent job per component or task
- split work when it is too broad to explain simply
- avoid coupling deployment, domain logic, and UI concerns without a clear reason
- prefer isolated changes that can be reviewed and tested directly
- complexity belongs in composition, not inside components

## Decision Framework

Ask these three questions about any component:
1. Can you explain what it does in one sentence?
2. If it fails, will it take down unrelated functionality?
3. Can you test it in isolation?

If "no" to any of these, the component is too large.

## Complexity Budget

- Function: < 50 lines
- Class/Module: < 200 lines
- File: < 500 lines
- Service: < 2000 lines

If a component exceeds these, decompose it. The system can be complex — the parts should not be.

## Anti-Patterns

- **God function**: 500 lines of mixed auth + validation + business logic + persistence + error handling. Split into five focused functions composed together.
- **Hidden complexity**: A function named "simple" that contains 300 lines of branching logic.
- **Coupled deployment**: A change to billing requires redeploying the entire UI because they share a module.

## Output Expectations

- name the boundary that should exist
- identify what should be split or narrowed
- restate the task or architecture in smaller coherent units
- estimate complexity against the budget
