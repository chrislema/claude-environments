#!/usr/bin/env node
// CLI for the deterministic check registry.
//
// Usage:
//   node checks/run.mjs release_blockers_zero <gate.json> [--mode=deployable]
//   node checks/run.mjs dependency_graph_acyclic <task-plan.json>
//   node checks/run.mjs plan_schema_complete <artifact.json>            (schema inferred from artifact_type)
//   node checks/run.mjs tier_order <release-gate.json>
//   node checks/run.mjs no_bcrypt_weak_hash <file> [<file> ...]
//   node checks/run.mjs file_ownership --role=<role> <path> [<path> ...]
//   node checks/run.mjs <trajectory_check> <events.jsonl> [--stage=<stage>] [--role=<role>]
//
// Exit codes: 0 = passed, 1 = failed, 2 = usage/loading error.
// Output: one JSON object {check, passed, reason}.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REGISTRY } from './checks.mjs';
import { parseEvents } from './lib.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TRAJECTORY = new Set([
  'write_paths_in_boundary', 'ran_code_before_complete', 'no_code_artifacts_written',
  'harness_run_before_findings', 'release_gate_read_before_deploy',
  'live_verify_after_deploy', 'ended_explicitly',
]);

function usage(msg) {
  console.error(msg);
  console.error(`known checks: ${Object.keys(REGISTRY).join(', ')}`);
  process.exit(2);
}

const [, , name, ...rest] = process.argv;
if (!name || !REGISTRY[name]) usage(`unknown or missing check: ${name ?? '(none)'}`);

const flags = {};
const args = [];
for (const a of rest) {
  const m = a.match(/^--([a-z-]+)=(.*)$/);
  if (m) flags[m[1]] = m[2];
  else args.push(a);
}

const loadJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const boundaries = () => loadJson(join(ROOT, 'policy', 'boundaries.json'));

let result;
try {
  if (TRAJECTORY.has(name)) {
    if (!args[0]) usage(`${name} requires an events.jsonl path`);
    const events = parseEvents(readFileSync(args[0], 'utf8'));
    result = REGISTRY[name](events, { stage: flags.stage, role: flags.role, boundaries: boundaries() });
  } else if (name === 'no_bcrypt_weak_hash') {
    if (!args.length) usage('no_bcrypt_weak_hash requires at least one file path');
    result = REGISTRY[name](args.map((p) => ({ path: p, content: readFileSync(p, 'utf8') })));
  } else if (name === 'file_ownership') {
    if (!flags.role || !args.length) usage('file_ownership requires --role=<role> and at least one path');
    result = REGISTRY[name]({ role: flags.role, paths: args, boundaries: boundaries() });
  } else if (name === 'plan_schema_complete') {
    if (!args[0]) usage('plan_schema_complete requires an artifact.json path');
    const artifact = loadJson(args[0]);
    const schemaPath = join(ROOT, 'schemas', `${artifact.artifact_type}.schema.json`);
    result = REGISTRY[name](artifact, { schema: loadJson(schemaPath) });
  } else {
    if (!args[0]) usage(`${name} requires an artifact.json path`);
    result = REGISTRY[name](loadJson(args[0]), { mode: flags.mode });
  }
} catch (e) {
  console.error(JSON.stringify({ check: name, passed: false, reason: `check error: ${e.message}` }));
  process.exit(2);
}

console.log(JSON.stringify({ check: name, ...result }));
process.exit(result.passed ? 0 : 1);
