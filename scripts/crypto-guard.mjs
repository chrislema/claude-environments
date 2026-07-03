#!/usr/bin/env node
// PreToolUse hook: enforce the crypto policy (PBKDF2 100k via Web Crypto; no bcrypt,
// no MD5, no plain SHA-256 for passwords) on code being written. Always active —
// this is settled platform policy, not a run-scoped rule.
//
// Only inspects code files; documentation may legitimately mention banned primitives.

import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { no_bcrypt_weak_hash } from '../checks/checks.mjs';

const CODE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.py', '.sql']);

let input;
try { input = JSON.parse(readFileSync(0, 'utf8')); } catch { process.exit(0); }

const filePath = input.tool_input?.file_path;
if (!filePath || !CODE_EXTENSIONS.has(extname(filePath).toLowerCase())) process.exit(0);

// Write carries full content; Edit carries the new fragment. Check whichever exists.
const content = input.tool_input?.content ?? input.tool_input?.new_string;
if (!content) process.exit(0);

const result = no_bcrypt_weak_hash([{ path: filePath, content }]);
if (!result.passed) {
  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: `Crypto policy violation: ${result.reason}. Policy: PBKDF2 with 100,000 iterations via the Web Crypto API for passwords; constant-time comparison for tokens. See the implement-auth skill.`,
    },
  }));
}
process.exit(0);
