---
name: implement-auth
description: Implements or reviews authentication — password hashing, session management, OAuth integration, and secret comparison — using secure, platform-appropriate primitives.
trigger: When implementing login, adding account creation, reviewing session handling, or integrating OAuth or external identity providers.
role: engineer
---

## Purpose

Guides the implementation of authentication flows — password hashing, session lifecycle, token comparison, and OAuth integration — ensuring secure primitives, correct metadata storage, and testable invalid-state handling.

## Procedure

1. **Identify the auth surface.** Determine which auth flows are in scope: password-based login, account creation, session management, OAuth integration, or a combination.

2. **Verify password hashing.** If password auth is involved:
   - Confirm PBKDF2 with 100,000 iterations via Web Crypto API.
   - Confirm SHA-256 with 32-byte output.
   - Confirm salt + hash combined and base64-encoded for storage.
   - Flag any use of bcrypt (npm dependency, weaker iterations) or plain SHA-256 (no salt, too fast).

3. **Verify token and secret comparison.** Inspect all comparisons of tokens, session IDs, API keys, and secrets:
   - Confirm constant-time comparison is used.
   - Flag any use of `===` for security-sensitive string comparison.

4. **Verify session management.** Inspect the session table and session creation logic:
   - Session ID: random 32-byte hex token.
   - User ID foreign key.
   - Expiration: 30 days from creation.
   - User agent stored (for device change detection).
   - IP address stored (for location change detection).
   - Last activity timestamp stored (for stale session detection).
   - Indexes on `expires_at` and `user_id`.

5. **Verify session enforcement.** Confirm that:
   - Expired sessions are rejected, not silently renewed.
   - Logout invalidates the session server-side (not just client cookie removal).
   - Session validation is testable with deterministic inputs.

6. **Verify OAuth integration** (if applicable):
   - ID token verified with the provider.
   - Audience validated against your client ID.
   - User found or created by provider ID or email.
   - Existing email accounts linked to OAuth provider on first OAuth login.
   - Session created using the same path as password login.

7. **Check for privilege escalation risks.** Review role assignment, session creation, and account linking for paths that could elevate privileges.

8. **Produce findings.** Document the auth implementation status against each checkpoint.

## Reference

### Password Hashing

Use PBKDF2 with 100,000 iterations via the Web Crypto API:
- No npm dependencies (native to Cloudflare Workers)
- Stronger than bcrypt cost 10 (~1,024 iterations)
- FIPS-compliant
- Use SHA-256 with 32-byte output
- Combine salt + hash, encode to base64 for storage

**Never use:**
- bcrypt: Requires npm dependency, weaker iteration count at typical cost factors.
- Plain SHA-256: No salt, too fast for password storage, trivially brute-forced.

### Token and Secret Comparison

Always use constant-time comparison for tokens, session IDs, and secrets to prevent timing attacks. Never use `===` for security-sensitive string comparison. In Web Crypto environments, use `crypto.subtle.timingSafeEqual` or an equivalent constant-time utility.

### Session Schema

Sessions should include security metadata:

| Column | Type | Purpose |
|--------|------|---------|
| session_id | TEXT (PK) | Random 32-byte hex token |
| user_id | TEXT (FK) | Links session to user |
| expires_at | TIMESTAMP | 30 days from creation |
| user_agent | TEXT | Detect device changes |
| ip_address | TEXT | Detect location changes |
| last_activity | TIMESTAMP | Detect stale sessions |

**Indexes:** `expires_at`, `user_id`

### OAuth Integration Pattern

When adding OAuth (Google, etc.):
1. Verify ID token with the provider.
2. Validate audience matches your client ID.
3. Find or create user by provider ID or email.
4. Link existing email accounts to OAuth provider on first OAuth login.
5. Create session same as password login (same session table, same metadata).

### Anti-Patterns

- **Timing-vulnerable comparison**: Using `===` to compare session tokens or API keys. Attackers can extract secrets byte-by-byte via timing differences.
- **Weak hashing**: bcrypt at low cost, MD5, or unsalted SHA-256 for passwords.
- **Client-only logout**: Deleting the cookie without invalidating the session server-side. The session token remains valid.
- **Missing session metadata**: No user agent or IP — makes it impossible to detect session hijacking.
- **OAuth without audience check**: Accepting any valid Google token regardless of which app it was issued for.
- **Separate session paths**: OAuth login creates sessions differently than password login, leading to inconsistent security metadata.

## Output

Produce an auth implementation review containing:

1. **Hashing audit**: Which hashing primitive is used, iteration count, salt handling, and encoding — with pass/fail against the PBKDF2 100k standard.
2. **Comparison audit**: Every location where tokens or secrets are compared, and whether constant-time comparison is used.
3. **Session schema audit**: The session table structure vs. the expected schema, with missing columns or indexes called out.
4. **Session lifecycle audit**: Whether expiration, logout invalidation, and stale detection are correctly implemented.
5. **OAuth audit** (if applicable): Token verification, audience validation, account linking, and session creation path.
6. **Escalation risks**: Any paths found where privilege escalation could occur.
