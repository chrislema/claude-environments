#!/usr/bin/env node
// PreToolUse hook: enforce role file boundaries during a delivery run.
//
// Active only when <cwd>/.delivery/boundary.json exists (written by the /deliver
// orchestrator when it spawns a role subagent). Outside a run this hook is a no-op,
// so interactive use is never affected.
//
// boundary.json: { "role": "engineer", "owned": [globs], "forbidden": [globs],
//                  "task_surfaces": [globs]? }
// Globs are relative to the repo root. Writes under .delivery/ are always allowed.
// Paths outside the repo (temp files, scratchpads) are not governed here.

import { readFileSync, existsSync } from 'node:fs';
import { join, relative, resolve, isAbsolute } from 'node:path';
import { matchesAny } from '../checks/lib.mjs';

function deny(reason) {
  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  }));
  process.exit(0);
}

let input;
try { input = JSON.parse(readFileSync(0, 'utf8')); } catch { process.exit(0); }

const cwd = input.cwd ?? process.cwd();
const manifestPath = join(cwd, '.delivery', 'boundary.json');
if (!existsSync(manifestPath)) process.exit(0); // no active run — inert

let boundary;
try { boundary = JSON.parse(readFileSync(manifestPath, 'utf8')); } catch {
  deny('.delivery/boundary.json exists but is unreadable — refusing writes until the run state is fixed (stable failure over clever recovery)');
}

const filePath = input.tool_input?.file_path;
if (!filePath) process.exit(0);

const abs = isAbsolute(filePath) ? filePath : resolve(cwd, filePath);
const rel = relative(cwd, abs);
if (rel.startsWith('..')) process.exit(0); // outside the repo — not governed
if (rel.startsWith('.delivery/') || rel.startsWith('.delivery\\')) process.exit(0);

const { role, owned = [], forbidden = [], task_surfaces } = boundary;

if (matchesAny(rel, forbidden)) {
  deny(`Boundary violation: role "${role}" may not write ${rel} (forbidden glob). File boundaries come from policy/boundaries.json — if this file genuinely belongs to your task, the task assignment is wrong; escalate instead of writing.`);
}
if (owned.length === 0) {
  deny(`Boundary violation: role "${role}" produces artifacts only and owns no repo files, but attempted to write ${rel}. Write your output as a pipeline artifact instead.`);
}
if (!matchesAny(rel, owned)) {
  deny(`Boundary violation: ${rel} is outside role "${role}" owned globs [${owned.join(', ')}]. Stay inside the task boundary; if the task requires this file, escalate.`);
}
if (Array.isArray(task_surfaces) && task_surfaces.length > 0 && !matchesAny(rel, task_surfaces)) {
  deny(`Task-boundary violation: ${rel} is not among this task's owned surfaces [${task_surfaces.join(', ')}]. No smuggled cleanups — if the file is genuinely needed, escalate to widen the task.`);
}

process.exit(0);
