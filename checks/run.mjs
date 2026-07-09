#!/usr/bin/env node
// CLI for the deterministic check registry.
//
// Single check:
//   node checks/run.mjs release_blockers_zero <gate.json> [--mode=deployable]
//   node checks/run.mjs dependency_graph_acyclic <task-plan.json>
//   node checks/run.mjs plan_schema_complete <artifact.json>   (schema inferred from artifact_type)
//   node checks/run.mjs tier_order <release-gate.json>
//   node checks/run.mjs no_bcrypt_weak_hash <file> [<file> ...]
//   node checks/run.mjs file_ownership --role=<role> <path> [<path> ...]
//   node checks/run.mjs <trajectory_check> <events.jsonl> [--stage=<stage>] [--role=<role>]
//
// Gate set (D10) — runs a named list of checks, writes the det-results file ITSELF and
// registers a det_results event via stage.mjs ITSELF, so no model token generation sits
// between a check's execution and the file a gate reads (T2):
//   node checks/run.mjs gate-set <name> [--artifact=p] [--events=p] [--stage=s] [--role=r]
//        [--readout=p] [--files=a,b] [--out=detFile] [--register]
//   → writes [{id, passed, reason}] to --out (or stdout). Exit 0 iff every gate passed.
//
// Exit codes: 0 = passed, 1 = failed, 2 = usage/loading error.
// Single-check output: one JSON object {check, passed, reason}.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
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

const loadJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const boundaries = () => loadJson(join(ROOT, 'policy', 'boundaries.json'));

function usage(msg) {
  console.error(msg);
  console.error(`known checks: ${Object.keys(REGISTRY).join(', ')}`);
  process.exit(2);
}

const [, , name, ...rest] = process.argv;

const flags = {};
const args = [];
for (const a of rest) {
  const m = a.match(/^--([a-z-]+)=(.*)$/);
  if (m) flags[m[1]] = m[2];
  else if (a.startsWith('--')) flags[a.slice(2)] = true;
  else args.push(a);
}

// --- gate-set mode (exits) --------------------------------------------------

function runSingleCheck(sub) {
  const check = REGISTRY[sub.check];
  if (!check) return { passed: false, reason: `unknown check "${sub.check}"` };
  try {
    if (sub.input === 'events') {
      const path = flags.events ?? '.delivery/events.jsonl';
      const events = parseEvents(readFileSync(path, 'utf8'));
      return check(events, { stage: flags.stage, role: flags.role, boundaries: boundaries() });
    }
    if (sub.input === 'files') {
      const list = (flags.files ? flags.files.split(',') : [])
        .map((s) => s.trim()).filter(Boolean).filter((p) => existsSync(p));
      return check(list.map((p) => ({ path: p, content: readFileSync(p, 'utf8') })));
    }
    if (sub.input === 'git') {
      const current = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' });
      const before = existsSync('.delivery/worktree-before.txt') ? readFileSync('.delivery/worktree-before.txt', 'utf8') : '';
      let readonly = [];
      if (existsSync('.delivery/boundary.json')) {
        try { readonly = JSON.parse(readFileSync('.delivery/boundary.json', 'utf8')).readonly ?? []; } catch { /* keep [] */ }
      }
      return check(current, { before, role: flags.role, boundaries: boundaries(), readonly });
    }
    // input: 'artifact'
    if (!flags.artifact) return { passed: false, reason: 'gate-set requires --artifact for this gate' };
    const artifact = loadJson(flags.artifact);
    const opts = {};
    if (sub.mode) opts.mode = sub.mode;
    if (sub.check === 'plan_schema_complete') {
      opts.schema = loadJson(join(ROOT, 'schemas', `${artifact.artifact_type}.schema.json`));
    }
    if (sub.readout && flags.readout && existsSync(flags.readout)) opts.readout = loadJson(flags.readout);
    return check(artifact, opts);
  } catch (e) {
    return { passed: false, reason: `check error: ${e.message}` };
  }
}

// A gate entry runs one check (entry.check) or several AND-ed checks (entry.checks) — the
// first failure wins, so an augmented gate (e.g. file_ownership = write_paths_in_boundary
// AND the worktree cross-check) reports the specific escape that tripped it.
function runGateEntry(entry) {
  const subs = entry.checks ?? [{ check: entry.check, input: entry.input, mode: entry.mode, readout: entry.readout }];
  for (const sub of subs) {
    const r = runSingleCheck(sub);
    if (!r.passed) return r;
  }
  return { passed: true, reason: 'ok' };
}

if (name === 'gate-set') {
  const setName = args[0];
  const sets = loadJson(join(ROOT, 'checks', 'gate-sets.json'));
  const set = sets[setName];
  if (!set) usage(`unknown gate-set: ${setName ?? '(none)'}`);
  const results = set.gates.map((g) => {
    const r = runGateEntry(g);
    return { id: g.gateId, passed: !!r.passed, reason: r.reason ?? '' };
  });
  const payload = JSON.stringify(results, null, 2);
  if (flags.out) writeFileSync(flags.out, payload);
  else console.log(payload);
  const failed = results.filter((r) => !r.passed).map((r) => r.id);
  if (flags.register && existsSync(join(process.cwd(), '.delivery', 'run.json'))) {
    execFileSync('node', [
      join(ROOT, 'scripts', 'stage.mjs'), 'event', '--type=det_results',
      `--data=${JSON.stringify({ gate_set: setName, out: flags.out ?? null, failed })}`,
    ], { stdio: 'ignore' });
  }
  process.exit(failed.length ? 1 : 0);
}

// --- single check -----------------------------------------------------------

if (!name || !REGISTRY[name]) usage(`unknown or missing check: ${name ?? '(none)'}`);

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
