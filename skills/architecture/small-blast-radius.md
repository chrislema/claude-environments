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

## Output Expectations

- name the boundary that should exist
- identify what should be split or narrowed
- restate the task or architecture in smaller coherent units
