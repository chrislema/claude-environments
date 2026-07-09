#!/usr/bin/env node
// Failure classification (D16): a deterministic classifier that reads a stage's event slice,
// its deterministic gate results, and its judgment, and emits one of five structural classes.
// deliver.js maps each class to a differently-shaped retry, so attempts are not wasted on a
// failure mode the classic remediation bounce cannot fix.
//
//   no_writes          → the builder produced nothing            → write-first prompt
//   boundary_blocked   → an ownership/worktree gate tripped      → escalate (task surfaces wrong)
//   verification_failed→ nothing ran / module_loads failed       → focused-repair prompt
//   judge_rejected     → quality gates/dimensions failed         → classic remediation bounce
//   infra_failure      → no usable judgment (judge outage/crash) → retry without spending budget
//
// Usage: node scripts/classify-failure.mjs --events=<jsonl> --stage=<s> --det=<json> --judgment=<json>

import { readFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const IS_WRITE = (e) => e.type === 'tool_use' && ['Write', 'Edit', 'MultiEdit'].includes(e.tool);
const IS_CODE = (e) => e.type === 'run_code' || (e.type === 'tool_use' && e.tool === 'Bash');

function sliceStage(events, stage) {
  if (!stage) return events;
  const start = events.findIndex((e) => e.type === 'stage_start' && e.stage === stage);
  if (start === -1) return events;
  const end = events.findIndex((e, i) => i > start && e.type === 'stage_end' && e.stage === stage);
  return events.slice(start, end === -1 ? undefined : end + 1);
}

// Pure classifier. Exported for tests.
export function classifyFailure({ events = [], det = [], judgment = null }) {
  if (!judgment || typeof judgment.passed !== 'boolean') {
    return { class: 'infra_failure', reason: 'no usable judgment was produced (judge outage or crash)' };
  }
  const detFailed = det.filter((d) => !d.passed).map((d) => d.id);
  if (!events.some(IS_WRITE)) {
    return { class: 'no_writes', reason: 'no Write/Edit in the stage — the builder produced no code' };
  }
  if (detFailed.includes('file_ownership')) {
    return { class: 'boundary_blocked', reason: 'the file_ownership/worktree gate failed — the task surfaces are likely wrong' };
  }
  if (detFailed.includes('module_loads') || !events.some(IS_CODE)) {
    return { class: 'verification_failed', reason: 'no verification ran, or module_loads failed — the change was not proven' };
  }
  return { class: 'judge_rejected', reason: `judge rejected on quality (gates_failed: ${(judgment.gates_failed ?? []).join(', ') || 'weak dimensions'})` };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const flags = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => {
    const i = a.indexOf('='); return i === -1 ? [a.slice(2), true] : [a.slice(2, i), a.slice(i + 1)];
  }));
  const events = flags.events && existsSync(flags.events)
    ? sliceStage(readFileSync(flags.events, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l)), flags.stage)
    : [];
  const det = flags.det && existsSync(flags.det) ? JSON.parse(readFileSync(flags.det, 'utf8')) : [];
  const judgment = flags.judgment && existsSync(flags.judgment) ? JSON.parse(readFileSync(flags.judgment, 'utf8')) : null;
  console.log(JSON.stringify(classifyFailure({ events, det, judgment })));
}
