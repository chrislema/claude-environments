#!/usr/bin/env node
// PostToolUse hook: append tool events to .delivery/events.jsonl — the trajectory
// surface graded by the trajectory checks and rubrics (see policy/events.md).
//
// Active only when <cwd>/.delivery/ exists. Append-only; never blocks the tool call.

import { readFileSync, existsSync, appendFileSync } from 'node:fs';
import { join, relative, resolve, isAbsolute } from 'node:path';

let input;
try { input = JSON.parse(readFileSync(0, 'utf8')); } catch { process.exit(0); }

const cwd = input.cwd ?? process.cwd();
const deliveryDir = join(cwd, '.delivery');
if (!existsSync(deliveryDir)) process.exit(0); // no active run — inert

const toolInput = input.tool_input ?? {};
const event = {
  ts: new Date().toISOString(),
  source: 'hook',
  type: 'tool_use',
  tool: input.tool_name,
  ok: !(input.tool_response?.is_error ?? false),
};

if (toolInput.file_path) {
  const abs = isAbsolute(toolInput.file_path) ? toolInput.file_path : resolve(cwd, toolInput.file_path);
  const rel = relative(cwd, abs);
  event.paths = [rel.startsWith('..') ? abs : rel];
}
if (typeof toolInput.command === 'string') {
  event.command = toolInput.command.slice(0, 500);
}

try {
  appendFileSync(join(deliveryDir, 'events.jsonl'), JSON.stringify(event) + '\n');
} catch {
  // Logging must never break the tool call; a missed event is visible as a gap, not a crash.
}
process.exit(0);
