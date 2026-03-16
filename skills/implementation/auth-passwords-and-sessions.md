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

## Password Hashing

Use PBKDF2 with 100,000 iterations via the Web Crypto API:
- No npm dependencies (native to Cloudflare Workers)
- Stronger than bcrypt cost 10 (~1,024 iterations)
- FIPS-compliant
- Use SHA-256 with 32-byte output
- Combine salt + hash, encode to base64 for storage

Never use bcrypt (npm dependency, weaker iterations). Never use plain SHA-256 (no salt, too fast).

## Token and Secret Comparison

Always use constant-time comparison for tokens, session IDs, and secrets to prevent timing attacks. Never use `===` for security-sensitive string comparison.

## Session Management

Sessions should include security metadata:
- Session ID: random 32-byte hex token
- User ID (foreign key)
- Expiration: 30 days from creation
- User agent: detect device changes
- IP address: detect location changes
- Last activity timestamp: detect stale sessions

Index sessions on `expires_at` and `user_id`.

## OAuth Integration

When adding OAuth (Google, etc.):
- Verify ID token with the provider
- Validate audience matches your client ID
- Find or create user by provider ID or email
- Link existing email accounts to OAuth provider on first OAuth login
- Create session same as password login

## Review Focus

- password hashing primitive and iteration count
- constant-time comparison for all secrets
- session table includes security metadata
- session expiration enforced
- provider identity verification (audience check)
- privilege escalation risks
