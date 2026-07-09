#!/usr/bin/env node
// Crypto policy guard (settled policy S-003): PBKDF2 100k via Web Crypto; no bcrypt, no MD5,
// no plain SHA-256 for passwords. Always active — this is settled platform policy, not a
// run-scoped rule. Runs in two modes:
//   PreToolUse (Write/Edit/MultiEdit): scans the incoming content/fragment and DENIES the
//     write before it lands.
//   PostToolUse (Write/Edit/MultiEdit): re-scans the whole file on disk and BLOCKS (feedback
//     to the model) — catching a violation assembled across two edits where each fragment
//     looked clean (D15). Bash-written code is caught later by the build crypto_compliance gate.
//
// Only inspects code files; documentation may legitimately mention banned primitives.

import { readFileSync, existsSync } from 'node:fs';
import { extname } from 'node:path';
import { no_bcrypt_weak_hash } from '../checks/checks.mjs';

const CODE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.py', '.sql']);
const POLICY = 'Policy S-003: PBKDF2 with 100,000 iterations via the Web Crypto API for passwords; constant-time comparison for tokens. See the implement-auth skill.';

let input;
try { input = JSON.parse(readFileSync(0, 'utf8')); } catch { process.exit(0); }

const filePath = input.tool_input?.file_path;
if (!filePath || !CODE_EXTENSIONS.has(extname(filePath).toLowerCase())) process.exit(0);

if (input.hook_event_name === 'PostToolUse') {
  // Full-file rescan of the assembled result.
  if (!existsSync(filePath)) process.exit(0);
  let content;
  try { content = readFileSync(filePath, 'utf8'); } catch { process.exit(0); }
  const result = no_bcrypt_weak_hash([{ path: filePath, content }]);
  if (!result.passed) {
    console.log(JSON.stringify({
      decision: 'block',
      reason: `Crypto policy violation in the assembled file: ${result.reason}. ${POLICY} Fix ${filePath} before continuing.`,
    }));
  }
  process.exit(0);
}

// PreToolUse: Write carries full content; Edit carries the new fragment.
const content = input.tool_input?.content ?? input.tool_input?.new_string;
if (!content) process.exit(0);

const result = no_bcrypt_weak_hash([{ path: filePath, content }]);
if (!result.passed) {
  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: `Crypto policy violation: ${result.reason}. ${POLICY}`,
    },
  }));
}
process.exit(0);
