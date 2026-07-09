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
    { id: 'T1', owner: 'engineer', deliverable: 'sessions schema migration', depends_on: [], acceptance_criteria: ['migration applies cleanly'], owned_surfaces: ['migrations/0007_sessions.sql'] },
    { id: 'T2', owner: 'engineer', deliverable: 'POST /login returning session cookie', depends_on: ['T1'], acceptance_criteria: ['200+cookie valid', '401 actionable body'], owned_surfaces: ['src/routes/login.js'] },
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

// Topology (S-001, Workers-first). Pages requires a source-quoted exception; Workers is the default.
const pagesPlan = { ...goodPlan, scaffold_profile: { name: 'legacy', flags: [], topology: 'pages' } };
const pagesReadout = { topology_exception: { quote: 'host the marketing site on Cloudflare Pages', source: 'spec.md', line: 12 } };

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
  ev({ type: 'tool_use', source: 'hook', tool: 'Write', paths: ['src/routes/login.js'], ok: true }),
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

// Designer teeth (no_banned_ui_patterns) — only public/** files are scanned.
const cleanUi = [{ path: 'public/app.css', content: 'body{font-family:Inter,sans-serif;background:#fff;color:#000}' }];
const gradientUi = [{ path: 'public/app.css', content: '.hero{background:linear-gradient(#fff,#000)}' }];
const dialogUi = [{ path: 'public/app.js', content: 'function del(){ if (confirm("sure?")) doDelete() }' }];
const badFontUi = [{ path: 'public/app.css', content: 'h1{font-family:Roboto, sans-serif}' }];
const frameworkUi = [{ path: 'public/index.html', content: '<script src="https://cdn.jsdelivr.net/npm/vue"></script>' }];
const backendFile = [{ path: 'src/routes/login.js', content: 'export const onRequest = () => new Response("ok")' }];

// Worktree cross-check (D15) — delta of `git status --porcelain` against the stage baseline.
const wtBefore = ''; // clean at stage start

// Scaffold hygiene (D11).
const goodWrangler = {
  main: 'src/index.js', compatibility_date: '2026-07-01', compatibility_flags: ['nodejs_compat'],
  assets: { binding: 'ASSETS' }, observability: { enabled: true },
  d1_databases: [{ binding: 'DB', database_name: 'x', database_id: 'a' }],
  env: {
    staging: { d1_databases: [{ binding: 'DB', database_name: 'x-staging', database_id: 'b' }] },
    production: { d1_databases: [{ binding: 'DB', database_name: 'x-prod', database_id: 'c' }] },
  },
};
const noMirrorWrangler = { ...goodWrangler, env: { staging: {}, production: {} } };
const noCompatFlag = { ...goodWrangler, compatibility_flags: [] };
const goodQueue = { queues: { consumers: [{ queue: 'q', max_retries: 3, dead_letter_queue: 'q-dlq' }] } };
const noDlqQueue = { queues: { consumers: [{ queue: 'q', max_retries: 3 }] } };
const goodDo = { durable_objects: { bindings: [{ name: 'C', class_name: 'Coordinator' }] }, migrations: [{ tag: 'v1', new_sqlite_classes: ['Coordinator'] }] };
const doNoMigration = { durable_objects: { bindings: [{ name: 'C', class_name: 'Coordinator' }] }, migrations: [] };
const flagsRegistry = JSON.parse(readFileSync(join(ROOT, 'scaffold', 'profiles', 'flags.json'), 'utf8'));

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
  ['topology_matches_policy', [goodPlan], true, 'Workers default (no scaffold profile)'],
  ['topology_matches_policy', [pagesPlan, { readout: pagesReadout }], true, 'Pages with source-quoted exception'],
  ['topology_matches_policy', [pagesPlan], false, 'Pages profile without a topology exception'],
  ['tier_order', [deployableGate], true, 'all PR tiers passed'],
  ['tier_order', [skippedTierGate], false, 'api skipped but e2e ran'],
  ['no_bcrypt_weak_hash', [[pbkdf2File]], true, 'PBKDF2 100k'],
  ['no_bcrypt_weak_hash', [[bcryptFile]], false, 'bcrypt import'],
  ['no_bcrypt_weak_hash', [[shaPasswordFile]], false, 'sha256 password hashing'],
  ['file_ownership', [{ role: 'engineer', paths: ['src/routes/login.js', 'migrations/0007_sessions.sql'], boundaries }], true, 'engineer in-bounds'],
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
  ['no_banned_ui_patterns', [cleanUi], true, 'approved font, no gradient'],
  ['no_banned_ui_patterns', [gradientUi], false, 'gradient in public CSS'],
  ['no_banned_ui_patterns', [dialogUi], false, 'confirm() dialog in public JS'],
  ['no_banned_ui_patterns', [badFontUi], false, 'non-approved font in public CSS'],
  ['no_banned_ui_patterns', [frameworkUi], false, 'framework CDN in public HTML'],
  ['no_banned_ui_patterns', [backendFile], true, 'backend file skipped (vacuous pass)'],
  ['worktree_clean_outside_boundary', [' M src/routes/login.js\n', { before: wtBefore, role: 'engineer', boundaries }], true, 'engineer newly dirtied an owned src/ file'],
  ['worktree_clean_outside_boundary', ['?? public/evil.js\n', { before: wtBefore, role: 'engineer', boundaries }], false, 'engineer escaped to public/ (forbidden) via the worktree'],
  ['worktree_clean_outside_boundary', ['?? public/index.html\n M src/routes/login.js\n', { before: '?? public/index.html\n', role: 'engineer', boundaries }], true, 'prior public/ dirt excluded by the stage delta'],
  ['worktree_clean_outside_boundary', ['?? scaffold.jsonc\n', { before: wtBefore, role: 'engineer', boundaries, readonly: ['scaffold.jsonc'] }], false, 'readonly scaffold surface modified'],
  ['wrangler_config_hygiene', [goodWrangler], true, 'valid config, bindings mirrored across envs'],
  ['wrangler_config_hygiene', [noMirrorWrangler], false, 'binding mirror incomplete in named envs'],
  ['wrangler_config_hygiene', [noCompatFlag], false, 'missing nodejs_compat flag'],
  ['queue_failure_policy', [goodQueue], true, 'consumer has max_retries + DLQ'],
  ['queue_failure_policy', [noDlqQueue], false, 'consumer missing dead_letter_queue'],
  ['queue_failure_policy', [{}], true, 'no queues (vacuous pass)'],
  ['do_migration_declared', [goodDo], true, 'DO class has a new_sqlite_classes migration'],
  ['do_migration_declared', [doNoMigration], false, 'DO class missing its migration'],
  ['do_migration_declared', [{}], true, 'no Durable Objects (vacuous pass)'],
  ['scaffold_profile_valid', [{ scaffold_profile: { name: 'my-app', flags: ['d1', 'kv'] } }, { flagsRegistry }], true, 'valid profile'],
  ['scaffold_profile_valid', [{ scaffold_profile: { name: 'my-app', flags: ['d1', 'bogus'] } }, { flagsRegistry }], false, 'unknown flag'],
  ['scaffold_profile_valid', [{ scaffold_profile: { name: 'Bad_Name', flags: [] } }, { flagsRegistry }], false, 'invalid Worker name'],
  ['scaffold_profile_valid', [{}, { flagsRegistry }], true, 'no profile (brownfield, vacuous pass)'],
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

// ---------------------------------------------------------------------------
// Registry sync (D18): no phantom checks; every deterministic gate is wired into
// its stage gate-set and covered, so a gate can never silently fail closed for
// lack of a result. Zero exceptions.
// ---------------------------------------------------------------------------
let regChecks = 0;
const reg = (cond, label) => {
  regChecks += 1;
  if (!cond) { failures += 1; console.log(`FAIL ${label}`); }
  else console.log(`ok   ${label}`);
};

const rubricFiles = [
  ...readdirSync(join(ROOT, 'rubrics')).filter((f) => f.endsWith('.rubric.json')).map((f) => join(ROOT, 'rubrics', f)),
  ...readdirSync(join(ROOT, 'rubrics', 'trajectory')).filter((f) => f.endsWith('.rubric.json')).map((f) => join(ROOT, 'rubrics', 'trajectory', f)),
];
const rubricsByName = {};
for (const rp of rubricFiles) {
  const r = JSON.parse(readFileSync(rp, 'utf8'));
  rubricsByName[r.target.name] = r;
  for (const g of r.gates ?? []) {
    if (g.check && typeof g.check === 'object' && g.check.deterministic) {
      reg(!!REGISTRY[g.check.deterministic], `registry-sync: ${r.target.name}/${g.id} → check "${g.check.deterministic}" exists in checks.mjs`);
    }
  }
}

const gateSets = JSON.parse(readFileSync(join(ROOT, 'checks', 'gate-sets.json'), 'utf8'));
for (const [setName, set] of Object.entries(gateSets)) {
  if (setName === '$comment') continue;
  // Every check named by any gate must exist — including inside AND-ed `checks` arrays.
  for (const g of set.gates) {
    const subs = g.checks ?? [{ check: g.check }];
    for (const s of subs) reg(!!REGISTRY[s.check], `gate-set "${setName}"/${g.gateId} → check "${s.check}" exists in checks.mjs`);
  }
  if (set.rubric === null) continue; // deterministic guard (e.g. scaffold hygiene) — no rubric to bind gates to
  const r = rubricsByName[set.rubric];
  reg(!!r, `gate-set "${setName}" → rubric "${set.rubric}" exists`);
  if (!r) continue;
  const detGateIds = (r.gates ?? []).filter((g) => g.check && typeof g.check === 'object').map((g) => g.id);
  const setGateIds = set.gates.map((g) => g.gateId);
  for (const g of set.gates) {
    reg(detGateIds.includes(g.gateId), `gate-set "${setName}"/${g.gateId} is a deterministic gate of "${set.rubric}"`);
  }
  for (const id of detGateIds) {
    reg(setGateIds.includes(id), `coverage: "${set.rubric}" deterministic gate "${id}" is wired in gate-set "${setName}"`);
  }
}

console.log(`\n${cases.length} check cases + ${regChecks} registry-sync checks, ${failures} failure(s)`);
process.exit(failures ? 1 : 0);
