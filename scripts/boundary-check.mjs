#!/usr/bin/env node
// PreToolUse hook: enforce role file boundaries during a delivery run (D15).
//
// Active only when <cwd>/.delivery/boundary.json exists (written by the /deliver
// orchestrator when it spawns a role subagent). Outside a run this hook is a no-op,
// so interactive use is never affected.
//
// boundary.json: { role, owned[], forbidden[], task_surfaces[]?, readonly[]? }
// Covers Write/Edit/MultiEdit (file_path) AND Bash (command). Shell parsing is
// best-effort: the hook denies what it can prove (redirections, tee, cp/mv/install,
// sed -i, dd of=, and a blocked-command list) and lets the post-hoc worktree cross-check
// catch whatever the parser misses — that cross-check, not this parser, is the guarantee.
// Writes under .delivery/ are always allowed; paths outside the repo are not governed.

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

const { role, owned = [], forbidden = [], task_surfaces, readonly = [] } = boundary;

// The boundary verdict for a single write target. Returns a deny reason, or null if allowed.
function pathReason(rel) {
  if (rel.startsWith('..')) return null; // outside the repo — not governed
  if (rel.startsWith('.delivery/') || rel.startsWith('.delivery\\')) return null; // artifact bookkeeping
  if (matchesAny(rel, readonly)) {
    return `readonly scaffold surface ${rel} may not be modified — extend the scaffold through your own owned files, or escalate`;
  }
  if (matchesAny(rel, forbidden)) {
    return `role "${role}" may not write ${rel} (forbidden glob). If this file genuinely belongs to your task, the task assignment is wrong; escalate instead of writing.`;
  }
  if (owned.length === 0) {
    return `role "${role}" produces artifacts only and owns no repo files, but attempted to write ${rel}. Write your output as a pipeline artifact instead.`;
  }
  if (!matchesAny(rel, owned)) {
    return `${rel} is outside role "${role}" owned globs [${owned.join(', ')}]. Stay inside the task boundary; if the task requires this file, escalate.`;
  }
  if (Array.isArray(task_surfaces) && task_surfaces.length > 0 && !matchesAny(rel, task_surfaces)) {
    return `${rel} is not among this task's owned surfaces [${task_surfaces.join(', ')}]. No smuggled cleanups — if the file is genuinely needed, escalate to widen the task.`;
  }
  return null;
}

const toRel = (t) => relative(cwd, isAbsolute(t) ? t : resolve(cwd, t));

// --- Write / Edit / MultiEdit ---------------------------------------------
const filePath = input.tool_input?.file_path;
if (filePath) {
  const reason = pathReason(toRel(filePath));
  if (reason) deny(`Boundary violation: ${reason}`);
  process.exit(0);
}

// --- Bash ------------------------------------------------------------------
const command = input.tool_input?.command;
if (typeof command !== 'string') process.exit(0);

// Blocked-command list: destructive or trust-breaking regardless of boundary.
const blocked = blockedReason(command);
if (blocked) deny(`Blocked command: ${blocked}`);

// Write-target parsing: any target that resolves inside the repo must pass the boundary.
for (const t of writeTargets(command)) {
  const reason = pathReason(toRel(t));
  if (reason) deny(`Boundary violation (shell write to ${t}): ${reason}`);
}
process.exit(0);

function blockedReason(cmd) {
  if (/\bsudo\b/.test(cmd)) return 'sudo is not permitted in a delivery run';
  if (/\bgit\s+reset\s+--hard\b/.test(cmd)) return 'git reset --hard discards work — escalate instead of resetting';
  if (/\bgit\s+clean\b/.test(cmd)) return 'git clean removes untracked files — escalate instead';
  if (/\bgit\s+checkout\s+--/.test(cmd)) return 'git checkout -- discards changes — escalate instead';
  if (/\bchmod\s+-[a-z]*R/i.test(cmd) || /\bchown\s+-[a-z]*R/i.test(cmd)) return 'recursive chmod/chown is not permitted';
  if (/\b(curl|wget)\b[^|]*\|\s*(sudo\s+)?(sh|bash|zsh|dash)\b/.test(cmd)) return 'piping a network fetch into a shell is not permitted';
  const rm = cmd.match(/\brm\b([^|;&\n]*)/);
  if (rm) {
    const rest = rm[1];
    const recursiveForce = /-[a-z]*r/i.test(rest) && /-[a-z]*f/i.test(rest);
    if (recursiveForce) {
      for (const t of rest.split(/\s+/).filter((a) => a && !a.startsWith('-'))) {
        if (t === '/' || t === '~' || t === '$HOME' || t.startsWith('~') || t.startsWith('/') || t.split('/').includes('..')) {
          return `rm -rf of "${t}" outside the repo is not permitted — escalate`;
        }
      }
    }
  }
  return null;
}

function writeTargets(cmd) {
  const targets = [];
  const unquote = (m) => m?.[2] ?? m?.[3] ?? m?.[4];
  for (const m of cmd.matchAll(/(?<![0-9&])>>?\s*("([^"]+)"|'([^']+)'|([^\s;|&>]+))/g)) targets.push(unquote(m));
  for (const m of cmd.matchAll(/\btee\b\s+(?:-a\s+)?("([^"]+)"|'([^']+)'|([^\s;|&]+))/g)) targets.push(unquote(m));
  for (const m of cmd.matchAll(/\bsed\b[^;|&]*?-i\b[^;|&]*?\s(\S+?)(?=\s|;|\||&|$)/g)) targets.push(m[1]);
  for (const m of cmd.matchAll(/\bdd\b[^;|&]*\bof=(\S+)/g)) targets.push(m[1]);
  for (const seg of cmd.split(/[;|&\n]+/)) {
    const cm = seg.trim().match(/^(cp|mv|install)\b(.*)$/);
    if (cm) {
      const positional = cm[2].split(/\s+/).filter((a) => a && !a.startsWith('-'));
      if (positional.length) targets.push(positional[positional.length - 1]);
    }
  }
  return targets
    .map((t) => t?.replace(/^['"]|['"]$/g, ''))
    .filter(Boolean)
    .filter((t) => !/^\/dev\//.test(t));
}
