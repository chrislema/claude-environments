# Skill: State And Error Boundaries

## Use When

- designing APIs or workflows
- refactoring stateful logic
- reviewing retries, fallback behavior, or recovery flows

## Guidance

- keep one clear source of truth for each important piece of state
- handle errors at boundaries instead of scattering rescue logic through business code
- prefer stable failed states and explicit repair paths over hidden recovery chains
- make lifecycle transitions visible and inspectable

## Output Expectations

- identify the authoritative state owner
- identify where boundary error handling should happen
- call out any hidden or duplicated state
