# Skill: Auth Passwords And Sessions

## Use When

- implementing login
- adding account creation
- reviewing session handling
- integrating OAuth or external identity providers

## Guidance

- choose secure, platform-appropriate hashing primitives
- treat session lifecycle as first-class domain behavior
- store security-relevant metadata deliberately
- keep provider linkage and verification explicit
- make invalid session and logout behavior testable

## Review Focus

- password storage
- session persistence
- renewal and expiration behavior
- provider identity verification
- privilege escalation risks
