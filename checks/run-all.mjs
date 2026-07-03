#!/usr/bin/env node
// Self-test harness: every check in the registry is exercised with a passing fixture and a
// failing fixture. Also validates every schema against a conforming and a broken artifact.
// Exit 0 only when every expectation holds.

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REGISTRY } from './checks.mjs';
import { validate } from './lib.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const boundaries = JSON.parse(readFileSync(join(ROOT, 'policy', 'boundaries.json'), 'utf8'));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const goodGate = {
  artifact_type: 'release-gate', decision: 'fail', event_type: 'pull_request',
  tiers: [
    { tier: 'smoke', status: 'passed', run_ref: 'sm-1' },
    { tier: 'api', status: 'passed', run_ref: 'api-1' },
    { tier: 'e2e', status: 'passed', run_ref: 'e2e-1' },
  ],
  critical_areas: [
    { area: 'auth', status: 'verified', evidence: 'api-1 cases 401/403' },
    { area: 'state_integrity', status: 'missing' },
    { area: 'billing', status: 'not_applicable', reason: 'no billing surface in scope' },
  ],
  blockers: ['state-integrity evidence missing for claim path'],
  cosmetic_issues: ['log prefix inconsistency'],
  summary: 'FAIL: one critical area lacks evidence; fix and re-gate.',
};

const deployableGate = {
  ...goodGate, decision: 'pass',
  critical_areas: goodGate.critical_areas.map((a) => (a.status === 'missing' ? { ...a, status: 'verified', evidence: 'run-2' } : a)),
  blockers: [], summary: 'PASS: all critical areas verified.',
};

const incoherentGate = { ...goodGate, decision: 'pass' }; // PASS with open blockers

const skippedTierGate = {
  ...deployableGate,
  tiers: [
    { tier: 'smoke', status: 'passed' },
    { tier: 'api', status: 'skipped' },
    { tier: 'e2e', status: 'passed' },
  ],
};

const goodPlan = {
  artifact_type: 'task-plan', scope: 'login feature',
  tasks: [
    { id: 'T1', owner: 'engineer', deliverable: 'sessions schema migration', depends_on: [], acceptance_criteria: ['migration applies cleanly'], owned_surfaces: ['0007_sessions.sql'] },
    { id: 'T2', owner: 'engineer', deliverable: 'POST /api/login returning session cookie', depends_on: ['T1'], acceptance_criteria: ['200+cookie valid', '401 actionable body'], owned_surfaces: ['functions/api/login.js'] },
    { id: 'T3', owner: 'tester', deliverable: 'smoke+API tests for login', depends_on: ['T2'], acceptance_criteria: ['happy, 401, 429-with-context covered'], owned_surfaces: ['tests/login.spec.js'] },
  ],
  open_decisions: [], risks: ['rate-limit storage choice deferred to T2'],
};

const cyclicPlan = {
  ...goodPlan,
  tasks: goodPlan.tasks.map((t) => (t.id === 'T1' ? { ...t, depends_on: ['T3'] } : t)),
};

const incompletePlan = {
  ...goodPlan,
  tasks: [{ id: 'T1', owner: 'engineer', deliverable: '', depends_on: [], acceptance_criteria: ['x'], owned_surfaces: ['y'] }],
};

const pbkdf2File = {
  path: 'src/utils/crypto.js',
  content: `export async function hashPassword(password, salt) {
  const key = await crypto.subtle.importKey('raw', enc(password), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100000 }, key, 256);
}`,
};
const bcryptFile = { path: 'src/utils/crypto.js', content: `import bcrypt from 'bcrypt';\nexport const hash = (pw) => bcrypt.hashSync(pw, 10);` };
const shaPasswordFile = { path: 'src/utils/crypto.js', content: `const crypto = require('node:crypto');\nexports.hashPassword = (password) => crypto.createHash('sha256').update(password).digest('hex');` };

const ev = (o) => ({ ts: '2026-07-03T00:00:00Z', source: 'orchestrator', ...o });
const engineerEvents = [
  ev({ type: 'stage_start', stage: 'build:T2', role: 'engineer' }),
  ev({ type: 'tool_use', source: 'hook', tool: 'Write', paths: ['functions/api/login.js'], ok: true }),
  ev({ type: 'run_code', ref: 'login probes', ok: true }),
  ev({ type: 'artifact_write', artifact_type: 'implementation-note', path: '.delivery/artifacts/in-T2.json' }),
  ev({ type: 'stage_end', stage: 'build:T2', reason: 'complete_stage' }),
];
const noRunEvents = engineerEvents.filter((e) => e.type !== 'run_code');
const outOfBoundsEvents = [
  engineerEvents[0],
  ev({ type: 'tool_use', source: 'hook', tool: 'Write', paths: ['public/index.html'], ok: true }),
  ...engineerEvents.slice(2),
];
const architectCleanEvents = [
  ev({ type: 'stage_start', stage: 'review', role: 'architect' }),
  ev({ type: 'artifact_read', artifact_type: 'task-plan', path: '.delivery/artifacts/plan.json' }),
  ev({ type: 'artifact_write', artifact_type: 'review-report', path: '.delivery/artifacts/review.json' }),
  ev({ type: 'stage_end', stage: 'review', reason: 'complete_stage' }),
];
const architectCodeEvents = [
  architectCleanEvents[0],
  ev({ type: 'tool_use', source: 'hook', tool: 'Write', paths: ['functions/api/export.js'], ok: true }),
  ...architectCleanEvents.slice(1),
];
const testerGoodEvents = [
  ev({ type: 'stage_start', stage: 'test', role: 'tester' }),
  ev({ type: 'tool_use', source: 'hook', tool: 'Write', paths: ['tests/login.api.js'], ok: true }),
  ev({ type: 'run_code', ref: 'harness', ok: true }),
  ev({ type: 'artifact_write', artifact_type: 'release-gate', path: '.delivery/artifacts/gate.json' }),
  ev({ type: 'stage_end', stage: 'test', reason: 'complete_stage' }),
];
const testerGateFirstEvents = [
  testerGoodEvents[0],
  ev({ type: 'artifact_write', artifact_type: 'release-gate', path: '.delivery/artifacts/gate.json' }),
  ev({ type: 'run_code', ref: 'harness', ok: true }),
  testerGoodEvents[4],
];
const deployGoodEvents = [
  ev({ type: 'stage_start', stage: 'deploy', role: 'deployer' }),
  ev({ type: 'artifact_read', artifact_type: 'release-gate', path: '.delivery/artifacts/gate.json' }),
  ev({ type: 'deploy', target: 'production', revision: 'abc123' }),
  ev({ type: 'live_verify', target: 'https://example.com/api/health', ok: true }),
  ev({ type: 'stage_end', stage: 'deploy', reason: 'complete_stage' }),
];
const deployBlindEvents = [
  deployGoodEvents[0],
  ev({ type: 'deploy', target: 'production', revision: 'abc123' }),
  ev({ type: 'stage_end', stage: 'deploy', reason: 'complete_stage' }),
];
const maxTurnsEvents = [
  ev({ type: 'stage_start', stage: 'plan', role: 'planner' }),
  ev({ type: 'stage_end', stage: 'plan', reason: 'max_turns' }),
];

// ---------------------------------------------------------------------------
// Expectations: [check, args, expectedPassed, label]
// ---------------------------------------------------------------------------

const loadSchema = (t) => JSON.parse(readFileSync(join(ROOT, 'schemas', `${t}.schema.json`), 'utf8'));

const cases = [
  ['release_blockers_zero', [goodGate, {}], true, 'FAIL gate with blockers is coherent'],
  ['release_blockers_zero', [incoherentGate, {}], false, 'PASS gate with open blockers'],
  ['release_blockers_zero', [deployableGate, { mode: 'deployable' }], true, 'clean PASS gate is deployable'],
  ['release_blockers_zero', [goodGate, { mode: 'deployable' }], false, 'FAIL gate is not deployable'],
  ['dependency_graph_acyclic', [goodPlan], true, 'linear T1→T2→T3'],
  ['dependency_graph_acyclic', [cyclicPlan], false, 'T1→T3→T2→T1 cycle'],
  ['plan_schema_complete', [goodPlan, { schema: loadSchema('task-plan') }], true, 'complete plan'],
  ['plan_schema_complete', [incompletePlan, { schema: loadSchema('task-plan') }], false, 'empty deliverable'],
  ['tier_order', [deployableGate], true, 'all PR tiers passed'],
  ['tier_order', [skippedTierGate], false, 'api skipped but e2e ran'],
  ['no_bcrypt_weak_hash', [[pbkdf2File]], true, 'PBKDF2 100k'],
  ['no_bcrypt_weak_hash', [[bcryptFile]], false, 'bcrypt import'],
  ['no_bcrypt_weak_hash', [[shaPasswordFile]], false, 'sha256 password hashing'],
  ['file_ownership', [{ role: 'engineer', paths: ['functions/api/login.js', '0007_sessions.sql'], boundaries }], true, 'engineer in-bounds'],
  ['file_ownership', [{ role: 'engineer', paths: ['public/index.html'], boundaries }], false, 'engineer touching frontend'],
  ['file_ownership', [{ role: 'planner', paths: ['anything.md'], boundaries }], false, 'planner owns nothing'],
  ['write_paths_in_boundary', [engineerEvents, { stage: 'build:T2', role: 'engineer', boundaries }], true, 'engineer writes in bounds'],
  ['write_paths_in_boundary', [outOfBoundsEvents, { stage: 'build:T2', role: 'engineer', boundaries }], false, 'engineer wrote public/'],
  ['ran_code_before_complete', [engineerEvents, { stage: 'build:T2' }], true, 'ran probes before complete'],
  ['ran_code_before_complete', [noRunEvents, { stage: 'build:T2' }], false, 'completed without running code'],
  ['no_code_artifacts_written', [architectCleanEvents, { stage: 'review' }], true, 'architect wrote artifacts only'],
  ['no_code_artifacts_written', [architectCodeEvents, { stage: 'review' }], false, 'architect wrote code'],
  ['harness_run_before_findings', [testerGoodEvents, { stage: 'test' }], true, 'harness before gate'],
  ['harness_run_before_findings', [testerGateFirstEvents, { stage: 'test' }], false, 'gate before harness'],
  ['release_gate_read_before_deploy', [deployGoodEvents, { stage: 'deploy' }], true, 'gate read before deploy'],
  ['release_gate_read_before_deploy', [deployBlindEvents, { stage: 'deploy' }], false, 'deployed unread'],
  ['live_verify_after_deploy', [deployGoodEvents, { stage: 'deploy' }], true, 'verified after deploy'],
  ['live_verify_after_deploy', [deployBlindEvents, { stage: 'deploy' }], false, 'no verify after deploy'],
  ['ended_explicitly', [engineerEvents, { stage: 'build:T2' }], true, 'complete_stage'],
  ['ended_explicitly', [maxTurnsEvents, { stage: 'plan' }], false, 'died at max_turns'],
];

let failures = 0;
for (const [name, args, expected, label] of cases) {
  const result = REGISTRY[name](...args);
  const ok = result.passed === expected;
  if (!ok) failures += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} — ${label}${ok ? '' : ` (got passed=${result.passed}: ${result.reason})`}`);
}

// Schema smoke: every schema file parses and rejects an empty object.
for (const f of readdirSync(join(ROOT, 'schemas'))) {
  const schema = JSON.parse(readFileSync(join(ROOT, 'schemas', f), 'utf8'));
  const rejectsEmpty = validate({}, schema).length > 0;
  if (!rejectsEmpty) { failures += 1; console.log(`FAIL schema ${f} — accepts an empty object`); }
  else console.log(`ok   schema ${f} — parses and rejects empty artifact`);
}

console.log(`\n${cases.length} check cases, ${failures} failure(s)`);
process.exit(failures ? 1 : 0);
